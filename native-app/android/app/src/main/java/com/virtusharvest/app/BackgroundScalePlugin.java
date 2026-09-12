package com.virtusharvest.app;

import android.content.Context;
import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Starts the Android foreground service while the app has a live scale link.
 * The BLE connection and unload rules stay in the existing Capacitor/WebView
 * code; the service keeps that process eligible to run when the screen is off.
 */
@CapacitorPlugin(name = "BackgroundScale")
public class BackgroundScalePlugin extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, ScaleMonitoringService.class);
        intent.setAction(ScaleMonitoringService.ACTION_START);
        intent.putExtra(ScaleMonitoringService.EXTRA_DEVICE_NAME,
            call.getString("deviceName", "Virtus scale"));

        try {
            ContextCompat.startForegroundService(context, intent);
            JSObject result = new JSObject();
            result.put("active", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to start background scale monitoring", error);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        context.stopService(new Intent(context, ScaleMonitoringService.class));
        JSObject result = new JSObject();
        result.put("active", false);
        call.resolve(result);
    }

    /** Returns the newest native GPS fix collected by the foreground service. */
    @PluginMethod
    public void getMotion(PluginCall call) {
        JSObject result = new JSObject();
        long timestamp = ScaleMonitoringService.getLastLocationAt();
        if (timestamp > 0L) {
            double latitude = ScaleMonitoringService.getLastLatitude();
            double longitude = ScaleMonitoringService.getLastLongitude();
            double speedKmh = ScaleMonitoringService.getLastSpeedKmh();
            float accuracy = ScaleMonitoringService.getLastAccuracy();
            result.put("timestamp", timestamp);
            if (!Double.isNaN(latitude)) result.put("latitude", latitude);
            if (!Double.isNaN(longitude)) result.put("longitude", longitude);
            if (!Double.isNaN(speedKmh)) result.put("speedKmh", speedKmh);
            if (!Float.isNaN(accuracy)) result.put("accuracy", accuracy);
        }
        call.resolve(result);
    }
}
