package com.virtusharvest.app;

import android.content.pm.ActivityInfo;
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
    }
}
