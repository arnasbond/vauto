package com.vauto.app;

import android.content.ComponentCallbacks2;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "VautoMainActivity";
    private boolean jsBridgeAttached = false;
    private boolean webViewColdStartDone = false;

    private static final String HOST_LOCALHOST = "localhost";
    private static final String HOST_VERCEL = "vauto-chi.vercel.app";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow()
            .getDecorView()
            .post(
                () -> {
                    if (webViewColdStartDone) return;
                    Bridge bridge = getBridge();
                    if (bridge == null) return;
                    WebView webView = bridge.getWebView();
                    if (webView == null) return;
                    purgeWebViewCacheAndStorage(webView);
                    configureWebView(webView, bridge);
                    reloadFreshDocument(webView);
                    webViewColdStartDone = true;
                }
            );
    }

    @Override
    public void onStart() {
        super.onStart();
        ensureWebViewConfigured();
    }

    @Override
    public void onResume() {
        super.onResume();
        ensureWebViewConfigured();
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

    private void ensureWebViewConfigured() {
        Bridge bridge = getBridge();
        if (bridge == null) return;
        WebView webView = bridge.getWebView();
        if (webView == null) return;
        if (!webViewColdStartDone) return;
        configureWebView(webView, bridge);
    }

    /** One-time cold start purge — drops stale JS bundles cached by WebView. */
    private void purgeWebViewCacheAndStorage(WebView webView) {
        try {
            webView.clearCache(true);
            webView.clearHistory();

            WebSettings settings = webView.getSettings();
            settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
            settings.setMediaPlaybackRequiresUserGesture(false);

            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            cookieManager.removeAllCookies(
                (ValueCallback<Boolean>) cleared -> {
                    cookieManager.flush();
                    Log.i(TAG, "WebView cookies cleared on cold start: " + cleared);
                }
            );
            WebStorage.getInstance().deleteAllData();

            Log.i(TAG, "WebView cache + storage purged on cold start");
        } catch (Exception e) {
            Log.w(TAG, "WebView cache purge failed", e);
        }
    }

    /** Force main document reload with cache-buster after purge. */
    private void reloadFreshDocument(WebView webView) {
        try {
            String url = webView.getUrl();
            if (url == null || url.isEmpty()) {
                url = "https://" + HOST_LOCALHOST + "/";
            }
            if (url.contains("_vc=")) return;
            String sep = url.contains("?") ? "&" : "?";
            String freshUrl = url + sep + "_vc=" + System.currentTimeMillis();
            Log.i(TAG, "Reloading fresh document: " + freshUrl);
            webView.loadUrl(freshUrl);
        } catch (Exception e) {
            Log.w(TAG, "Fresh document reload failed", e);
        }
    }

    private void configureWebView(WebView webView, Bridge bridge) {
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

    /**
     * Blocks all external navigation and CDN redirects (incl. release-assets.githubusercontent.com).
     * Never calls super for blocked URLs — no launchIntent, no DownloadManager loop.
     */
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

        /** @return true = consume URL (block), false = allow WebView load */
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

    /** Opens APK update URL in system browser — WebView blocks github/.apk navigation. */
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
