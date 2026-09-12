package com.virtusharvest.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * Keeps the Capacitor process and BLE callback path alive while the display is
 * off. The app starts it only after a scale connection succeeds and stops it on
 * disconnect or when its configured scale sleep timer fires.
 */
public class ScaleMonitoringService extends Service {
    static final String ACTION_START = "com.virtusharvest.app.START_SCALE_MONITORING";
    static final String EXTRA_DEVICE_NAME = "deviceName";

    private static final String CHANNEL_ID = "scale_monitoring";
    private static final int NOTIFICATION_ID = 1801;
    private static volatile double lastLatitude = Double.NaN;
    private static volatile double lastLongitude = Double.NaN;
    private static volatile double lastSpeedKmh = Double.NaN;
    private static volatile float lastAccuracy = Float.NaN;
    private static volatile long lastLocationAt = 0L;
    private PowerManager.WakeLock wakeLock;
    private LocationManager locationManager;
    private LocationListener locationListener;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String deviceName = intent == null ? null : intent.getStringExtra(EXTRA_DEVICE_NAME);
        if (deviceName == null || deviceName.trim().isEmpty()) deviceName = "Virtus scale";

        Notification notification = buildNotification(deviceName);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            int serviceTypes = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE;
            if (hasLocationPermission()) {
                serviceTypes |= ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
            }
            startForeground(
                NOTIFICATION_ID,
                notification,
                serviceTypes
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        acquireCpuLock();
        startLocationUpdates();

        // A killed app must reconnect and authenticate normally next time it opens.
        // Restarting this service without the WebView would leave a misleading
        // notification but could not receive or save weights.
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        stopLocationUpdates();
        releaseCpuLock();
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void acquireCpuLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager manager = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = manager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            getPackageName() + ":scale-monitoring"
        );
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
    }

    private void releaseCpuLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
    }

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    @SuppressWarnings("MissingPermission")
    private void startLocationUpdates() {
        if (!hasLocationPermission() || locationListener != null) return;
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (locationManager == null) return;

        locationListener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                if (location == null) return;
                lastLatitude = location.getLatitude();
                lastLongitude = location.getLongitude();
                lastAccuracy = location.hasAccuracy() ? location.getAccuracy() : Float.NaN;
                lastSpeedKmh = location.hasSpeed()
                    ? Math.max(0d, location.getSpeed() * 3.6d)
                    : Double.NaN;
                lastLocationAt = location.getTime() > 0L
                    ? location.getTime()
                    : System.currentTimeMillis();
            }

            @Override public void onProviderEnabled(String provider) {}
            @Override public void onProviderDisabled(String provider) {}
            @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
        };

        requestProvider(LocationManager.GPS_PROVIDER);
    }

    @SuppressWarnings("MissingPermission")
    private void requestProvider(String provider) {
        try {
            if (locationManager.isProviderEnabled(provider)) {
                locationManager.requestLocationUpdates(provider, 1000L, 0.5f, locationListener);
            }
        } catch (IllegalArgumentException | SecurityException ignored) {
            // The WebView status remains "Waiting for GPS" until a valid fix is available.
        }
    }

    private void stopLocationUpdates() {
        if (locationManager != null && locationListener != null) {
            try { locationManager.removeUpdates(locationListener); }
            catch (SecurityException ignored) {}
        }
        locationListener = null;
        locationManager = null;
    }

    static double getLastLatitude() { return lastLatitude; }
    static double getLastLongitude() { return lastLongitude; }
    static double getLastSpeedKmh() { return lastSpeedKmh; }
    static float getLastAccuracy() { return lastAccuracy; }
    static long getLastLocationAt() { return lastLocationAt; }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Scale monitoring",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Shows when Virtus Harvest is monitoring a connected scale");
        channel.setShowBadge(false);
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification(String deviceName) {
        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, openApp, pendingFlags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Scale monitoring active")
            .setContentText(deviceName + " — GPS-gated unload detection is running")
            .setContentIntent(contentIntent)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build();
    }
}
