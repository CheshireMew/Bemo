package io.github.cheshiremew.bemo;

import android.os.Bundle;
import android.view.View;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private int lastKeyboardInset = -1;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeHostPlugin.class);
        registerPlugin(NativeHttpPlugin.class);
        super.onCreate(savedInstanceState);
        bindKeyboardInsetBridge();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (bridge != null) {
                    bridge.triggerWindowJSEvent("bemoBackButton");
                    return;
                }

                if (!moveTaskToBack(true)) {
                    finish();
                }
            }
        });
    }

    private void bindKeyboardInsetBridge() {
        final View content = findViewById(android.R.id.content);
        if (content == null) {
            return;
        }

        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets imeInsets = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            Insets systemBarInsets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            int keyboardInsetPx = Math.max(0, imeInsets.bottom - systemBarInsets.bottom);
            float density = getResources().getDisplayMetrics().density;
            int keyboardInsetDp = Math.round(keyboardInsetPx / density);

            if (bridge != null && keyboardInsetPx != lastKeyboardInset) {
                lastKeyboardInset = keyboardInsetPx;
                bridge.triggerWindowJSEvent(
                    "bemoKeyboardInsetChange",
                    "{\"height\":" + keyboardInsetDp + "}"
                );
            }

            // Consume IME insets so the system does NOT resize the WebView
            // for the keyboard. JS handles keyboard compensation exclusively
            // via mobileKeyboardInset to avoid double-compensation.
            return new WindowInsetsCompat.Builder(windowInsets)
                .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                .build();
        });

        content.post(() -> ViewCompat.requestApplyInsets(content));
    }
}
