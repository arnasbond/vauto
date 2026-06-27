package com.vauto.app;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/** Block APK download links from opening Android's external download UI during login. */
public class VautoWebViewClient extends BridgeWebViewClient {

    public VautoWebViewClient(Bridge bridge) {
        super(bridge);
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (uri != null && shouldBlockExternalInstallLink(uri.toString())) {
            return true;
        }
        return super.shouldOverrideUrlLoading(view, request);
    }

    @SuppressWarnings("deprecation")
    @Override
    public boolean shouldOverrideUrlLoading(WebView view, String url) {
        if (shouldBlockExternalInstallLink(url)) {
            return true;
        }
        return super.shouldOverrideUrlLoading(view, url);
    }

    private static boolean shouldBlockExternalInstallLink(String url) {
        if (url == null || url.isEmpty()) return false;
        String lower = url.toLowerCase();
        if (!lower.contains("github.com")) return false;
        return lower.contains(".apk")
            || lower.contains("/releases/download/")
            || lower.contains("/releases/tag/android");
    }
}
