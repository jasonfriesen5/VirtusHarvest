package com.virtusharvest.app;

import android.Manifest;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundScalePlugin.class);
        super.onCreate(savedInstanceState);

        // Lock phones upright; leave tablets free to rotate. The value comes
        // from a resource so values-sw600dp can flip it — android:
        // screenOrientation in the manifest applies to every device and cannot.
        if (getResources().getBoolean(R.bool.portraitOnly)) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        }

        // Without POST_NOTIFICATIONS the foreground service still runs, but
        // Android 13+ shows nothing for it — the operator gets no sign the scale
        // is being watched, and the near-full alarm cannot surface on a locked
        // screen. Asked once at launch; denial only costs the notification.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                   != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 9111);
        }
    }
}
