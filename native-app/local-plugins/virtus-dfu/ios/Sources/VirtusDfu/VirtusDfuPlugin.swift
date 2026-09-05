import Foundation
import Capacitor
import NordicDFU
import CoreBluetooth

/// Nordic DFU for the Virtus scale.
///
/// ## Why this scans instead of using the buttonless jump
///
/// The scale runs Adafruit's nRF52 bootloader (0.11.0, s140 6.1.1), whose
/// `BLEDfu` service is Nordic **Legacy** DFU (`00001530-1212-EFDE-1523-…`), not
/// Secure DFU. Letting Nordic's library drive the buttonless jump does not work
/// from iOS: Adafruit's `START_DFU` handler stashes the phone's connection
/// address in the bootloader's peer-data block, so the bootloader comes back up
/// *directed*-advertising at that address. iOS rotates its random address on
/// every connection and does not surface directed advertisements to unbonded
/// centrals, so nobody ever hears the bootloader and the library times out
/// (`DFUError 201`, "Device failed to connect"). Nordic documents this exact
/// case on `forceScanningForNewAddressInLegacyDfu` — and notes that flag alone
/// cannot fix it, because the directed packets are empty.
///
/// So the jump is done by the *application* instead: the JS side sends the
/// firmware's own `DFU` command, which sets GPREGRET and resets **without**
/// writing peer data. With no valid peer data the bootloader falls back to
/// ordinary undirected advertising under the name `AdaDFU` — the same state a
/// double-tap reset produces, and one iOS can see. This plugin then scans for
/// that advertisement and hands Nordic a peripheral that is *already* in DFU
/// mode, so there is no mode switch and no reconnect to get wrong.
///
/// Note on identifiers: on iOS a peripheral is addressed by a per-app UUID, not
/// a MAC, and the bootloader's UUID differs from the application's. That is
/// another reason the caller's saved device id is useless here and scanning is
/// the only reliable way in.
@objc(VirtusDfuPlugin)
public class VirtusDfuPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VirtusDfuPlugin"
    public let jsName = "VirtusDfu"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startDFU", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "abortDFU", returnType: CAPPluginReturnPromise)
    ]

    /// Legacy DFU service, advertised by the Adafruit bootloader.
    /// What the bootloader actually advertises, confirmed on hardware:
    /// name `DfuTarg`, service `FE59`. Note the asymmetry — the *application*
    /// exposes the legacy 128-bit DFU service `00001530-…` via Adafruit's
    /// `BLEDfu`, but the *bootloader* advertises the 16-bit `FE59`. Both are
    /// accepted here so neither end is missed.
    private static let dfuServices: [CBUUID] = [
        CBUUID(string: "FE59"),
        CBUUID(string: "00001530-1212-EFDE-1523-785FEABCD123")
    ]

    private var central: CBCentralManager?
    private var controller: DFUServiceController?
    /// Held so the promise resolves only when DFU truly completes or fails —
    /// resolving on `startDFU` returning would report success before any bytes move.
    private var pendingCall: CAPPluginCall?

    // Scan state. The peripheral must be held strongly or Core Bluetooth
    // deallocates it the moment the scan stops.
    private var bootloaderName = "DfuTarg"
    private var firmware: DFUFirmware?
    private var target: CBPeripheral?
    private var scanDeadline: Date?
    private var scanTimer: Timer?
    private var scanning = false
    /// Every distinct advertised name seen during the scan, in discovery order.
    /// Reported back on timeout — without it a failed scan says nothing about
    /// *why*, and the difference between "board never rebooted" (still see
    /// "Virtus Scale") and "bootloader has an unexpected name" is everything.
    private var seenNames: [String] = []

    // MARK: - JS API

    @objc func startDFU(_ call: CAPPluginCall) {
        guard let rawPath = call.getString("filePath"), !rawPath.isEmpty else {
            call.reject("filePath is required")
            return
        }

        // Capacitor's Filesystem returns file:// URIs; DFUFirmware wants a plain path.
        let path = rawPath.hasPrefix("file://")
            ? (URL(string: rawPath)?.path ?? rawPath.replacingOccurrences(of: "file://", with: ""))
            : rawPath

        guard FileManager.default.fileExists(atPath: path) else {
            call.reject("Firmware file not found: \(path)")
            return
        }

        do {
            firmware = try DFUFirmware(urlToZipFile: URL(fileURLWithPath: path))
        } catch {
            call.reject("Invalid DFU package: \(error.localizedDescription)")
            return
        }

        bootloaderName = call.getString("bootloaderName") ?? "AdaDFU"
        let timeout = call.getDouble("scanTimeout") ?? 40.0
        scanDeadline = Date().addingTimeInterval(timeout)

        call.keepAlive = true
        pendingCall = call

        // A fresh central per run: Nordic's library takes over the delegate once
        // DFU starts and does not hand it back, so reusing one across runs would
        // leave us without discovery callbacks the second time.
        teardownCentral()
        central = CBCentralManager(delegate: self, queue: nil)
        // Discovery begins in centralManagerDidUpdateState — a new manager starts
        // in .unknown and powers up asynchronously, and scanning before .poweredOn
        // silently does nothing.
    }

    @objc func abortDFU(_ call: CAPPluginCall) {
        let aborted = controller?.abort() ?? false
        if scanning { stopScan() }
        call.resolve(["aborted": aborted])
    }

    // MARK: - Scanning for the bootloader

    private func startScan() {
        guard let central = central, !scanning else { return }
        scanning = true
        seenNames = []
        notify(state: "Scanning for bootloader")

        // No service filter: the Adafruit bootloader's advertisement carries the
        // name but not reliably the 128-bit DFU service UUID, and a filtered scan
        // would never report it. Matching is done in didDiscover instead.
        central.scanForPeripherals(withServices: nil, options: nil)

        scanTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self = self, let deadline = self.scanDeadline else { return }
            if Date() >= deadline {
                let seen = self.seenNames
                self.stopScan()
                CAPLog.print("[VirtusDfu] scan timed out. Saw: \(seen.joined(separator: ", "))")
                let stillInApp = seen.contains { $0.localizedCaseInsensitiveContains("virtus") }
                self.finish {
                    if stillInApp {
                        $0.reject("The scale never rebooted into update mode — it's still advertising as a scale. [saw: \(seen.prefix(12).joined(separator: ", "))]")
                    } else {
                        $0.reject("Couldn't find the scale in update mode. Make sure it's powered on and nearby, then try again. [saw: \(seen.prefix(12).joined(separator: ", "))]")
                    }
                }
            }
        }
    }

    private func stopScan() {
        scanning = false
        scanTimer?.invalidate()
        scanTimer = nil
        central?.stopScan()
    }

    private func matchesBootloader(_ peripheral: CBPeripheral,
                                   _ advertisementData: [String: Any]) -> Bool {
        // The service UUID is the trustworthy signal and is checked first: this
        // board advertises FE59 in bootloader mode. The name check is the
        // fallback for builds that omit the UUID from the advertisement.
        //
        // Kept deliberately a little loose on the name. An exact-equality test on
        // the wrong name is exactly what cost a flash cycle here — the bootloader
        // turned out to be "DfuTarg" while this matched only "AdaDFU", so a board
        // sitting in update mode a foot away was skipped. Any name containing
        // "dfu" counts; the odds of an unrelated device advertising that next to
        // a grain cart are negligible, and the cost of a miss is far higher.
        if let uuids = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID],
           uuids.contains(where: { Self.dfuServices.contains($0) }) {
            return true
        }
        guard let name = (advertisementData[CBAdvertisementDataLocalNameKey] as? String)
                ?? peripheral.name else { return false }
        if name.caseInsensitiveCompare(bootloaderName) == .orderedSame { return true }
        if name.localizedCaseInsensitiveContains("dfu") { return true }
        return false
    }

    // MARK: - Internals

    private func beginDfu(_ peripheral: CBPeripheral) {
        guard let central = central, let firmware = firmware else {
            finish { $0.reject("Bluetooth unavailable") }
            return
        }

        let initiator = DFUServiceInitiator(centralManager: central, target: peripheral)
            .with(firmware: firmware)
        initiator.delegate = self
        initiator.progressDelegate = self
        initiator.logger = self

        // The peripheral is already sitting in the bootloader, so there is no
        // mode switch to perform and nothing to reconnect to. Left off
        // deliberately — see the note at the top of this file.
        initiator.forceScanningForNewAddressInLegacyDfu = false

        // Resume is safe — Nordic only resumes when the CRC of the partial upload matches.
        initiator.disableResume = false

        controller = initiator.start(target: peripheral)
    }

    private func notify(state: String) {
        notifyListeners("DFUStateChanged", data: ["state": state])
    }

    private func teardownCentral() {
        stopScan()
        central?.delegate = nil
        central = nil
        target = nil
    }

    private func finish(_ block: (CAPPluginCall) -> Void) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        call.keepAlive = false
        block(call)
        controller = nil
        firmware = nil
        stopScan()
    }
}

// MARK: - Central manager state & discovery

extension VirtusDfuPlugin: CBCentralManagerDelegate {
    public func centralManagerDidUpdateState(_ manager: CBCentralManager) {
        switch manager.state {
        case .poweredOn:
            if pendingCall != nil && target == nil { startScan() }
        case .unknown, .resetting:
            break   // transient — wait for the next update
        default:
            finish { $0.reject("Bluetooth is not available (state: \(manager.state.rawValue))") }
        }
    }

    public func centralManager(_ manager: CBCentralManager,
                               didDiscover peripheral: CBPeripheral,
                               advertisementData: [String: Any],
                               rssi RSSI: NSNumber) {
        guard scanning, target == nil else { return }

        let advName = (advertisementData[CBAdvertisementDataLocalNameKey] as? String)
            ?? peripheral.name ?? "(no name)"
        if !seenNames.contains(advName) {
            seenNames.append(advName)
            let uuids = (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID])?
                .map { $0.uuidString }.joined(separator: ",") ?? "-"
            CAPLog.print("[VirtusDfu] saw '\(advName)' services=[\(uuids)]")
        }

        guard matchesBootloader(peripheral, advertisementData) else { return }

        CAPLog.print("[VirtusDfu] found bootloader \(peripheral.name ?? "?") \(peripheral.identifier)")
        target = peripheral     // strong ref — Core Bluetooth drops it otherwise
        stopScan()
        beginDfu(peripheral)
    }
}

// MARK: - DFU state

extension VirtusDfuPlugin: DFUServiceDelegate {
    public func dfuStateDidChange(to state: DFUState) {
        notify(state: String(describing: state))
        if state == .completed {
            finish { $0.resolve(["completed": true]) }
        }
    }

    public func dfuError(_ error: DFUError, didOccurWithMessage message: String) {
        notifyListeners("DFUStateChanged", data: [
            "state": "error",
            "error": message
        ])
        finish { $0.reject(message, String(describing: error)) }
    }
}

// MARK: - Progress

extension VirtusDfuPlugin: DFUProgressDelegate {
    public func dfuProgressDidChange(for part: Int,
                                     outOf totalParts: Int,
                                     to progress: Int,
                                     currentSpeedBytesPerSecond: Double,
                                     avgSpeedBytesPerSecond: Double) {
        notifyListeners("DFUStateChanged", data: [
            "state": "uploading",
            "percent": progress,
            "part": part,
            "totalParts": totalParts,
            "speed": avgSpeedBytesPerSecond
        ])
    }
}

// MARK: - Logging

extension VirtusDfuPlugin: LoggerDelegate {
    public func logWith(_ level: LogLevel, message: String) {
        // Surfaced so a failed flash can be diagnosed from the app's own console
        // rather than only from Xcode.
        if level.rawValue >= LogLevel.warning.rawValue {
            CAPLog.print("[VirtusDfu] \(message)")
        }
    }
}
