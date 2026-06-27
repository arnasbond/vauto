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
    }

    @Override
    public void onStart() {
        super.onStart();
        tuneWebViewForMedia();
    }

    @Override
    public void onResume() {
        super.onResume();
        tuneWebViewForMedia();
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

    /** WebView media + Samsung Fold stability tuning. */
    private void tuneWebViewForMedia() {
        Bridge bridge = getBridge();
        if (bridge == null) return;
        WebView webView = bridge.getWebView();
        if (webView == null) return;

        WebSettings settings = webView.getSettings();
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setOffscreenPreRaster(false);
        settings.setMediaPlaybackRequiresUserGesture(false);

        if (!(webView.getWebChromeClient() instanceof VautoWebChromeClient)) {
            webView.setWebChromeClient(new VautoWebChromeClient(bridge));
        }
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
