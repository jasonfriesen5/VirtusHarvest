package com.virtusfeed.dfu;

import android.app.Activity;

import no.nordicsemi.android.dfu.DfuBaseService;

/**
 * Nordic runs the entire flash inside a Service, and requires a concrete
 * subclass it can start. This is that subclass and nothing more.
 *
 * {@link #getNotificationTarget()} returns null on purpose: the plugin runs DFU
 * with notifications disabled and foreground mode off (see VirtusDfuPlugin), so
 * there is no notification for a tap to return from. Returning an Activity here
 * while notifications are disabled would be dead code at best.
 */
public class DfuService extends DfuBaseService {

    @Override
    protected Class<? extends Activity> getNotificationTarget() {
        return null;
    }

    /**
     * Verbose library logging, off deliberately. A failed flash is diagnosed from
     * the DFUStateChanged events the plugin already forwards to the JS console,
     * which is reachable over `adb logcat | grep Capacitor/Console` without a
     * rebuild. (Not wired to BuildConfig.DEBUG: AGP 8 only generates BuildConfig
     * when `buildFeatures.buildConfig` is enabled, and turning that on for one
     * boolean is not worth it. Flip to `true` by hand when debugging DFU.)
     */
    @Override
    protected boolean isDebug() {
        return false;
    }
}
