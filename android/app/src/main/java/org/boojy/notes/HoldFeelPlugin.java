package org.boojy.notes;

import android.view.HapticFeedbackConstants;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The system's own long-press tap (src/phone/haptics.ts). Through the view, not
 * the vibrator: Android skips it when Touch feedback is off, and it needs no
 * VIBRATE permission. Capacitor's Haptics plugin drives the vibrator directly.
 */
@CapacitorPlugin(name = "HoldFeel")
public class HoldFeelPlugin extends Plugin {
    @PluginMethod
    public void held(PluginCall call) {
        getActivity()
            .runOnUiThread(() -> {
                getBridge().getWebView().performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
                call.resolve();
            });
    }
}
