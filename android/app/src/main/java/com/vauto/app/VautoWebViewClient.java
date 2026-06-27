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

    public static boolean shouldBlockInstallDownload(String url) {
        if (url == null || url.isEmpty()) return false;
        String lower = url.toLowerCase();
        if (lower.contains("/download/vauto") && lower.endsWith(".apk")) return true;
        if (!lower.contains("github.com")) return false;
        return lower.contains(".apk")
            || lower.contains("/releases/download/")
            || lower.contains("/releases/tag/android");
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (uri != null && shouldBlockInstallDownload(uri.toString())) {
            return true;
        }
        return super.shouldOverrideUrlLoading(view, request);
    }

    @SuppressWarnings("deprecation")
    @Override
    public boolean shouldOverrideUrlLoading(WebView view, String url) {
        if (shouldBlockInstallDownload(url)) {
            return true;
        }
        return super.shouldOverrideUrlLoading(view, url);
    }
}
