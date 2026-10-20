package org.boojy.notes;

import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.ViewConfiguration;
import android.webkit.WebView;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * A long press on a word, as a finger would make it (src/phone/selectWord.ts).
 * A double-tap that lands just past a short word selects nothing, and a
 * selection the page makes itself gets no handles and no Copy menu: only the
 * WebView's own long-press gives both. The point is in the page's CSS pixels.
 */
@CapacitorPlugin(name = "SelectWord")
public class SelectWordPlugin extends Plugin {
    @PluginMethod
    public void pressAt(PluginCall call) {
        Double x = call.getDouble("x");
        Double y = call.getDouble("y");
        if (x == null || y == null) {
            call.reject("pressAt needs x and y");
            return;
        }
        getActivity()
            .runOnUiThread(() -> {
                WebView view = getBridge().getWebView();
                float density = view.getResources().getDisplayMetrics().density;
                float px = (float) (x * density);
                float py = (float) (y * density);
                long down = SystemClock.uptimeMillis();
                send(view, down, down, MotionEvent.ACTION_DOWN, px, py);
                view.postDelayed(
                    () -> {
                        send(view, down, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, px, py);
                        call.resolve();
                    },
                    ViewConfiguration.getLongPressTimeout() + 100
                );
            });
    }

    private static void send(WebView view, long down, long at, int action, float x, float y) {
        MotionEvent event = MotionEvent.obtain(down, at, action, x, y, 0);
        event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        view.dispatchTouchEvent(event);
        event.recycle();
    }
}
