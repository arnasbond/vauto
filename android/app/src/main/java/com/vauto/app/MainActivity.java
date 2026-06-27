package com.vauto.app;

import android.content.ComponentCallbacks2;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "VautoMainActivity";

    /** Bundled Capacitor shell (production APK). */
    private static final String HOST_LOCALHOST = "localhost";

    /** Optional live fallback/error page only. */
    private static final String HOST_VERCEL = "vauto-chi.vercel.app";

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

        if (!(webView.getWebViewClient() instanceof VautoUrlGuardWebViewClient)) {
            webView.setWebViewClient(new VautoUrlGuardWebViewClient(bridge));
        }

        // Never hand off to Android DownloadManager from inside the WebView shell.
        webView.setDownloadListener(
            (url, userAgent, contentDisposition, mimeType, contentLength) ->
                Log.w(TAG, "Blocked WebView download: " + url)
        );
    }

    private void trimWebViewMemory(boolean aggressive) {
        Bridge bridge = getBridge();
        if (bridge == null) return;
        WebView webView = bridge.getWebView();
        if (webView == null) return;
        if (aggressive) {
            webView.clearFormData();
        }
    }

    /**
     * Strict in-app navigation only. External URLs (GitHub, APK, Render API, browser)
     * return true — consumed silently, no reload, no DownloadManager, no Chrome Custom Tab.
     * Auth/API must use fetch/XHR from JS, not full-page WebView navigation.
     */
    private static final class VautoUrlGuardWebViewClient extends BridgeWebViewClient {

        VautoUrlGuardWebViewClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (request != null && !request.isForMainFrame()) {
                return false;
            }
            Uri uri = request != null ? request.getUrl() : null;
            return handleNavigation(uri != null ? uri.toString() : null);
        }

        @SuppressWarnings("deprecation")
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleNavigation(url);
        }

        /** @return true = block navigation (handled), false = allow WebView to load */
        private boolean handleNavigation(String url) {
            if (url == null || url.isEmpty()) {
                return true;
            }

            if (isHardBlocked(url)) {
                Log.w(TAG, "Hard-blocked URL: " + url);
                return true;
            }

            if (isAllowedInAppUrl(url)) {
                return false;
            }

            Log.w(TAG, "Blocked external navigation: " + url);
            return true;
        }

        private static boolean isHardBlocked(String url) {
            String lower = url.toLowerCase();
            if (lower.contains(".apk")) return true;
            if (lower.contains("github.com")) return true;
            if (lower.contains("/releases/download/")) return true;
            if (lower.contains("/releases/tag/")) return true;
            if (lower.contains("vauto-api.onrender.com")) return true;
            if (lower.contains("/download/vauto")) return true;
            return false;
        }

        private static boolean isAllowedInAppUrl(String url) {
            Uri uri;
            try {
                uri = Uri.parse(url);
            } catch (Exception e) {
                return false;
            }

            String scheme = uri.getScheme();
            if (scheme == null) return false;

            if ("file".equalsIgnoreCase(scheme)) return true;
            if ("capacitor".equalsIgnoreCase(scheme)) return true;

            if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) {
                return false;
            }

            String host = uri.getHost();
            if (host == null) return false;
            host = host.toLowerCase();

            return HOST_LOCALHOST.equals(host) || HOST_VERCEL.equals(host);
        }
    }
}
