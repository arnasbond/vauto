package com.vauto.app;

import android.content.ComponentCallbacks2;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        tuneWebViewForFoldables();
    }

    @Override
    public void onResume() {
        super.onResume();
        tuneWebViewForFoldables();
    }

    @Override
    public void onPause() {
        trimWebViewMemory(false);
        super.onPause();
    }

    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) {
            trimWebViewMemory(true);
        }
    }

    /** Reduce Samsung Fold WebView renderer crashes (OOM / fold resize). */
    private void tuneWebViewForFoldables() {
        Bridge bridge = getBridge();
        if (bridge == null) return;
        WebView webView = bridge.getWebView();
        if (webView == null) return;

        WebSettings settings = webView.getSettings();
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setOffscreenPreRaster(false);
    }

    private void trimWebViewMemory(boolean aggressive) {
        Bridge bridge = getBridge();
        if (bridge == null) return;
        WebView webView = bridge.getWebView();
        if (webView == null) return;
        if (aggressive) {
            webView.clearCache(false);
        }
    }
}
