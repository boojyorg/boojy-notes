package org.boojy.notes;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugins are registered before the bridge starts.
        registerPlugin(HoldFeelPlugin.class);
        registerPlugin(SelectWordPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
