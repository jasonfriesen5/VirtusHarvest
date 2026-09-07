package com.virtusharvest.dfu;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

import no.nordicsemi.android.dfu.DfuProgressListenerAdapter;
import no.nordicsemi.android.dfu.DfuServiceController;
import no.nordicsemi.android.dfu.DfuServiceInitiator;
import no.nordicsemi.android.dfu.DfuServiceListenerHelper;

/**
 * Nordic DFU for the Virtus scale — the Android counterpart to VirtusDfuPlugin.swift.
 *
 * ## Why this scans instead of letting Nordic drive the buttonless jump
 *
 * Same reason as iOS, and the JS side is identical on both platforms: before
 * calling startDFU it sends the firmware's own `DFU` UART command, which sets
 * GPREGRET and resets **without** writing peer data, so the Adafruit bootloader
 * comes back up advertising normally as `DfuTarg`. By the time we are called the
 * device is *already* in DFU mode, so there is no mode switch to perform —
 * handing Nordic the application's address and asking it to do the jump would
 * make it wait for a transition that already happened.
 *
 * The Android-specific catch that makes scanning mandatory rather than merely
 * tidy: **the bootloader advertises under a different MAC than the application**
 * (Adafruit's bootloader uses application address + 1). So the caller's saved
 * device address is not the address to flash, and there is no way to derive the
 * right one except by looking. Nordic's own `setDeviceAddress` expects the
 * bootloader's address, not the app's.
 *
 * ## Foreground / notifications
 *
 * DFU runs with `setForeground(false)` and `setDisableNotification(true)`. That
 * avoids POST_NOTIFICATIONS (Android 13+) and the foreground-service-type rules
 * (Android 14+) entirely. It is safe here because the flash only ever runs with
 * the app open and on screen — the JS guards it with `_otaInProgress` and shows
 * live progress — and a service started while the app is foregrounded is allowed
 * to run. If firmware updates ever need to survive backgrounding, this is the
 * decision to revisit, and it will bring the notification permission with it.
 */
@CapacitorPlugin(name = "VirtusDfu")
public class VirtusDfuPlugin extends Plugin {

    private static final String TAG = "VirtusDfu";
    private static final String EVENT = "DFUStateChanged";

    /**
     * What the bootloader actually advertises, confirmed on hardware: name
     * `DfuTarg`, service `FE59`. The *application* exposes the legacy 128-bit
     * DFU service via Adafruit's BLEDfu, but the *bootloader* advertises the
     * 16-bit FE59. Both accepted so neither end is missed.
     */
    private static final ParcelUuid DFU_SERVICE_16 =
        ParcelUuid.fromString("0000fe59-0000-1000-8000-00805f9b34fb");
    private static final ParcelUuid DFU_SERVICE_128 =
        ParcelUuid.fromString("00001530-1212-efde-1523-785feabcd123");

    private final Handler handler = new Handler(Looper.getMainLooper());

    private PluginCall pendingCall;
    private DfuServiceController controller;
    private BluetoothLeScanner scanner;
    private ScanCallback scanCallback;
    private Runnable scanTimeout;
    private boolean scanning = false;
    private boolean listenerRegistered = false;

    private String bootloaderName = "DfuTarg";
    private String firmwarePath;

    /**
     * Every distinct advertised name seen during the scan, in discovery order.
     * Reported back on timeout — without it a failed scan says nothing about
     * *why*, and the difference between "board never rebooted" (still see
     * "Virtus Scale") and "bootloader has an unexpected name" is everything.
     */
    private final List<String> seenNames = new ArrayList<>();

    // ─── JS API ──────────────────────────────────────────────────────────────

    @PluginMethod
    public void startDFU(PluginCall call) {
        if (pendingCall != null) {
            call.reject("A firmware update is already running");
            return;
        }

        String rawPath = call.getString("filePath");
        if (rawPath == null || rawPath.isEmpty()) {
            call.reject("filePath is required");
            return;
        }

        // Capacitor's Filesystem returns file:// URIs; Nordic wants a plain path.
        String path = rawPath.startsWith("file://") ? Uri.parse(rawPath).getPath() : rawPath;
        if (path == null || !new File(path).exists()) {
            call.reject("Firmware file not found: " + rawPath);
            return;
        }
        firmwarePath = path;

        String name = call.getString("bootloaderName");
        bootloaderName = (name == null || name.isEmpty()) ? "DfuTarg" : name;
        double timeoutSec = call.getDouble("scanTimeout", 40.0);

        if (!hasScanPermission()) {
            call.reject("Bluetooth scan permission not granted");
            return;
        }

        BluetoothAdapter adapter = getAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            call.reject("Bluetooth is off");
            return;
        }
        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) {
            call.reject("Bluetooth scanner unavailable");
            return;
        }

        call.setKeepAlive(true);

        // Capacitor dispatches plugin methods on its own background thread, while
        // scan results and Nordic's progress broadcasts arrive on main. Rather
        // than synchronise every field, all mutable state is owned by the main
        // thread and entered only from here.
        final long timeoutMs = (long) (timeoutSec * 1000);
        handler.post(() -> {
            // The authoritative duplicate check — the one at the top of this
            // method reads pendingCall off-thread and is only a cheap early out.
            if (pendingCall != null) {
                call.setKeepAlive(false);
                call.reject("A firmware update is already running");
                return;
            }
            pendingCall = call;
            registerProgressListener();
            startScan(timeoutMs);
        });
    }

    @PluginMethod
    public void abortDFU(PluginCall call) {
        // Same threading rule as startDFU — touch state only on main.
        handler.post(() -> doAbort(call));
    }

    private void doAbort(PluginCall call) {
        boolean aborted = false;
        if (controller != null) {
            // Nordic will follow up with onDfuAborted, which settles the pending
            // startDFU call — so deliberately don't settle it here as well.
            controller.abort();
            aborted = true;
        } else if (pendingCall != null) {
            // Aborted while still scanning: no controller exists yet, so nothing
            // will ever call back. Settle the startDFU promise here or the JS
            // leaves _otaInProgress true forever and blocks every later update.
            aborted = true;
            finishReject("Firmware update cancelled");
        }
        stopScan();
        JSObject ret = new JSObject();
        ret.put("aborted", aborted);
        call.resolve(ret);
    }

    // ─── Scanning for the bootloader ─────────────────────────────────────────

    private void startScan(long timeoutMs) {
        if (scanning) return;
        scanning = true;
        seenNames.clear();
        notifyState("Scanning for bootloader");

        // No service filter: the Adafruit bootloader's advertisement carries the
        // name but not reliably the DFU service UUID, and a filtered scan would
        // never report it. Matching happens in the callback instead.
        ScanSettings settings = new ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build();

        // Every callback hops to the main thread before touching plugin state.
        // ScanCallback is delivered on a binder thread, and the scan-timeout
        // Runnable below runs on main: without this, `seenNames` is appended
        // from one thread while the timeout copies it from another, which throws
        // ConcurrentModificationException on precisely the path where the scan
        // is already failing. Confining all of it to one thread also removes the
        // race where a discovery and the timeout could both settle the call.
        scanCallback = new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, ScanResult result) {
                handler.post(() -> handleScanResult(result));
            }

            @Override
            public void onBatchScanResults(List<ScanResult> results) {
                handler.post(() -> {
                    for (ScanResult r : results) handleScanResult(r);
                });
            }

            @Override
            public void onScanFailed(int errorCode) {
                handler.post(() -> finishReject("Bluetooth scan failed (error " + errorCode + ")"));
            }
        };

        try {
            scanner.startScan(null, settings, scanCallback);
        } catch (SecurityException e) {
            finishReject("Bluetooth scan permission denied");
            return;
        }

        scanTimeout = () -> {
            List<String> seen = new ArrayList<>(seenNames);
            stopScan();
            Log.w(TAG, "scan timed out. Saw: " + join(seen));
            boolean stillInApp = false;
            for (String n : seen) {
                if (n.toLowerCase().contains("virtus")) { stillInApp = true; break; }
            }
            String tail = " [saw: " + join(seen.subList(0, Math.min(12, seen.size()))) + "]";
            if (stillInApp) {
                finishReject("The scale never rebooted into update mode — it's still advertising as a scale." + tail);
            } else {
                finishReject("Couldn't find the scale in update mode. Make sure it's powered on and nearby, then try again." + tail);
            }
        };
        handler.postDelayed(scanTimeout, timeoutMs);
    }

    private void handleScanResult(ScanResult result) {
        // Posted work can land after the scan was stopped or the call already
        // settled — both are normal, and acting on them would start a second DFU.
        if (!scanning || pendingCall == null) return;

        String advName = null;
        if (result.getScanRecord() != null) {
            advName = result.getScanRecord().getDeviceName();
        }
        if (advName == null) {
            try {
                advName = result.getDevice().getName();
            } catch (SecurityException ignored) {
                // BLUETOOTH_CONNECT not granted — name is unavailable, match on UUID only.
            }
        }
        String shown = advName == null ? "(no name)" : advName;
        if (!seenNames.contains(shown)) {
            seenNames.add(shown);
            Log.d(TAG, "saw '" + shown + "' " + result.getDevice().getAddress());
        }

        if (!matchesBootloader(result, advName)) return;

        String address = result.getDevice().getAddress();
        Log.i(TAG, "found bootloader " + shown + " at " + address);
        stopScan();
        beginDfu(address, advName);
    }

    /**
     * Service UUID first — it is the trustworthy signal. Name is the fallback for
     * builds that omit the UUID from the advertisement.
     *
     * Kept deliberately loose on the name, for the reason recorded on the iOS
     * side: an exact-equality test on the wrong name cost a whole flash cycle
     * once, because the bootloader advertises `DfuTarg` while the code matched
     * only `AdaDFU` — a board sitting in update mode a foot away was skipped in
     * silence. Any name containing "dfu" counts. The odds of an unrelated device
     * advertising that next to a grain cart are negligible, and the cost of a
     * miss is far higher than the cost of a wrong guess.
     */
    private boolean matchesBootloader(ScanResult result, String advName) {
        if (result.getScanRecord() != null) {
            List<ParcelUuid> uuids = result.getScanRecord().getServiceUuids();
            if (uuids != null) {
                for (ParcelUuid u : uuids) {
                    if (DFU_SERVICE_16.equals(u) || DFU_SERVICE_128.equals(u)) return true;
                }
            }
        }
        if (advName == null) return false;
        if (advName.equalsIgnoreCase(bootloaderName)) return true;
        return advName.toLowerCase().contains("dfu");
    }

    private void stopScan() {
        if (scanTimeout != null) {
            handler.removeCallbacks(scanTimeout);
            scanTimeout = null;
        }
        if (scanning && scanner != null && scanCallback != null) {
            try {
                scanner.stopScan(scanCallback);
            } catch (SecurityException ignored) {
                // Permission revoked mid-scan; nothing useful to do.
            }
        }
        scanning = false;
        scanCallback = null;
    }

    // ─── The flash itself ────────────────────────────────────────────────────

    private void beginDfu(String address, String advName) {
        DfuServiceInitiator initiator = new DfuServiceInitiator(address)
            .setZip(firmwarePath)
            // The device is already in the bootloader, so there is nothing to
            // switch — see the note at the top of this file.
            .setKeepBond(false)
            // Notifications and foreground mode off; see the class javadoc.
            .setForeground(false)
            .setDisableNotification(true);

        if (advName != null) {
            initiator.setDeviceName(advName);
        }

        // Adafruit's bootloader on an nRF52 needs a beat between preparing a data
        // object and writing it; without the delay the upload intermittently
        // fails partway with a remote DFU error. Nordic recommends 400ms and
        // documents this as the fix for exactly this class of flakiness.
        initiator.setPrepareDataObjectDelay(400);

        controller = initiator.start(getContext(), DfuService.class);
    }

    private void registerProgressListener() {
        if (listenerRegistered) return;
        DfuServiceListenerHelper.registerProgressListener(getContext(), progressListener);
        listenerRegistered = true;
    }

    private void unregisterProgressListener() {
        if (!listenerRegistered) return;
        DfuServiceListenerHelper.unregisterProgressListener(getContext(), progressListener);
        listenerRegistered = false;
    }

    /**
     * State names are passed through to JS as-is. The web UI treats `percent` as
     * the progress signal and shows any other `state` string verbatim, so these
     * only need to be human-readable — but "Scanning for bootloader" is matched
     * exactly by the JS, so don't reword that one.
     */
    private final DfuProgressListenerAdapter progressListener = new DfuProgressListenerAdapter() {
        @Override
        public void onDeviceConnecting(String address) {
            notifyState("Connecting");
        }

        @Override
        public void onDfuProcessStarting(String address) {
            notifyState("Starting");
        }

        @Override
        public void onEnablingDfuMode(String address) {
            notifyState("Enabling DFU mode");
        }

        @Override
        public void onProgressChanged(String address, int percent, float speed,
                                      float avgSpeed, int currentPart, int partsTotal) {
            JSObject data = new JSObject();
            data.put("state", "uploading");
            data.put("percent", percent);
            data.put("part", currentPart);
            data.put("totalParts", partsTotal);
            data.put("speed", avgSpeed);
            notifyListeners(EVENT, data);
        }

        @Override
        public void onDfuCompleted(String address) {
            notifyState("completed");
            JSObject ret = new JSObject();
            ret.put("completed", true);
            finishResolve(ret);
        }

        @Override
        public void onDfuAborted(String address) {
            finishReject("Firmware update aborted");
        }

        @Override
        public void onError(String address, int error, int errorType, String message) {
            JSObject data = new JSObject();
            data.put("state", "error");
            data.put("error", message);
            notifyListeners(EVENT, data);
            finishReject(message == null ? ("DFU error " + error) : message);
        }
    };

    // ─── Internals ───────────────────────────────────────────────────────────

    private void notifyState(String state) {
        JSObject data = new JSObject();
        data.put("state", state);
        notifyListeners(EVENT, data);
    }

    private void finishResolve(JSObject data) {
        PluginCall call = pendingCall;
        pendingCall = null;
        cleanup();
        if (call != null) {
            call.setKeepAlive(false);
            call.resolve(data);
        }
    }

    private void finishReject(String message) {
        PluginCall call = pendingCall;
        pendingCall = null;
        cleanup();
        if (call != null) {
            call.setKeepAlive(false);
            call.reject(message);
        }
    }

    private void cleanup() {
        stopScan();
        unregisterProgressListener();
        controller = null;
        firmwarePath = null;
    }

    @Override
    protected void handleOnDestroy() {
        cleanup();
        super.handleOnDestroy();
    }

    private BluetoothAdapter getAdapter() {
        BluetoothManager mgr = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return mgr == null ? null : mgr.getAdapter();
    }

    private boolean hasScanPermission() {
        String perm = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            ? Manifest.permission.BLUETOOTH_SCAN
            : Manifest.permission.ACCESS_FINE_LOCATION;
        return ContextCompat.checkSelfPermission(getContext(), perm) == PackageManager.PERMISSION_GRANTED;
    }

    private static String join(List<String> items) {
        return String.join(", ", items);
    }
}
