package com.vauto.app;

import android.content.ComponentCallbacks2;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "VautoMainActivity";
    private boolean jsBridgeAttached = false;
    private static boolean httpCachePurgedThisProcess = false;

    private static final String HOST_LOCALHOST = "localhost";
    private static final String HOST_VERCEL = "vauto-chi.vercel.app";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();
        configureWebView();
    }

    @Override
    public void onResume() {
        super.onResume();
        configureWebView();
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

    private void configureWebView() {
        Bridge bridge = getBridge();
        if (bridge == null) return;
        WebView webView = bridge.getWebView();
        if (webView == null) return;

        purgeHttpCacheOnce(webView);

        WebSettings settings = webView.getSettings();
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setOffscreenPreRaster(false);
        settings.setMediaPlaybackRequiresUserGesture(false);

        if (!(webView.getWebChromeClient() instanceof VautoWebChromeClient)) {
            webView.setWebChromeClient(new VautoWebChromeClient(bridge));
        }

        if (!(webView.getWebViewClient() instanceof VautoUrlGuardWebViewClient)) {
            webView.setWebViewClient(new VautoUrlGuardWebViewClient(bridge));
        }

        webView.setDownloadListener(
            new DownloadListener() {
                @Override
                public void onDownloadStart(
                    String url,
                    String userAgent,
                    String contentDisposition,
                    String mimetype,
                    long contentLength
                ) {
                    Log.w(TAG, "Swallowed download (blocked): " + url);
                }
            }
        );

        injectNativeVersionScript(webView, this);

        if (!jsBridgeAttached) {
            webView.addJavascriptInterface(new VautoJsBridge(this), "VautoAndroid");
            jsBridgeAttached = true;
        }
    }

    /**
     * Purge WebView HTTP disk cache once per process — safe for Capacitor localhost.
     * Does NOT wipe cookies/localStorage/WebStorage (that broke app launch on v1.1.3).
     */
    private static void purgeHttpCacheOnce(WebView webView) {
        if (httpCachePurgedThisProcess || webView == null) return;
        httpCachePurgedThisProcess = true;
        try {
            webView.clearCache(true);
            Log.i(TAG, "WebView HTTP cache purged (cold start, no storage wipe)");
        } catch (Exception e) {
            Log.w(TAG, "WebView cache purge failed", e);
        }
    }

    private static void injectNativeVersionScript(WebView webView, android.content.Context context) {
        if (webView == null || context == null) return;
        try {
            android.content.pm.PackageInfo pkg =
                context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            String versionName =
                pkg.versionName != null ? pkg.versionName.replace("\"", "\\\"") : "";
            String js =
                "(function(){window.__VAUTO_NATIVE_VERSION__={versionCode:"
                    + pkg.versionCode
                    + ",versionName:\""
                    + versionName
                    + "\"};})();";
            webView.evaluateJavascript(js, null);
        } catch (Exception e) {
            Log.w(TAG, "Native version inject failed", e);
        }
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

    static boolean isHardBlocked(String url) {
        if (url == null || url.isEmpty()) return true;
        String lower = url.toLowerCase();
        if (lower.contains("github")) return true;
        if (lower.contains("usercontent")) return true;
        if (lower.contains("render.com")) return true;
        if (lower.contains(".apk")) return true;
        if (lower.contains("vauto.apk")) return true;
        return false;
    }

    /** Block CDN/APK fetches only — allow render.com for auth fetch/XHR. */
    static boolean isHardBlockedResource(String url) {
        if (url == null || url.isEmpty()) return false;
        String lower = url.toLowerCase();
        if (lower.contains("github")) return true;
        if (lower.contains("usercontent")) return true;
        if (lower.contains(".apk")) return true;
        if (lower.contains("vauto.apk")) return true;
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

    private static final class VautoUrlGuardWebViewClient extends BridgeWebViewClient {

        private final MainActivity activity;

        VautoUrlGuardWebViewClient(Bridge bridge) {
            super(bridge);
            this.activity = bridge != null && bridge.getActivity() instanceof MainActivity
                ? (MainActivity) bridge.getActivity()
                : null;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            if (request != null && request.getUrl() != null) {
                String url = request.getUrl().toString();
                if (isHardBlockedResource(url)) {
                    Log.w(TAG, "Intercept-blocked: " + url);
                    return emptyResponse();
                }
            }
            return super.shouldInterceptRequest(view, request);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (view != null && url != null && isAllowedInAppUrl(url) && activity != null) {
                injectNativeVersionScript(view, activity);
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String url =
                request != null && request.getUrl() != null ? request.getUrl().toString() : null;
            return handleNavigation(url, request == null || request.isForMainFrame());
        }

        @SuppressWarnings("deprecation")
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleNavigation(url, true);
        }

        private boolean handleNavigation(String url, boolean mainFrame) {
            if (isHardBlocked(url)) {
                Log.w(TAG, "Hard-blocked navigation: " + url);
                return true;
            }

            if (!mainFrame) {
                return false;
            }

            if (url == null || url.isEmpty()) {
                return true;
            }

            if (isAllowedInAppUrl(url)) {
                return false;
            }

            Log.w(TAG, "Blocked external navigation: " + url);
            return true;
        }

        private static WebResourceResponse emptyResponse() {
            return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
        }
    }

    static final class VautoJsBridge {
        private final MainActivity activity;

        VautoJsBridge(MainActivity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public void openExternalUrl(String url) {
            if (url == null || url.isEmpty()) return;
            activity.runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    activity.startActivity(intent);
                } catch (Exception e) {
                    Log.w(TAG, "openExternalUrl failed: " + url, e);
                }
            });
        }
    }
}
