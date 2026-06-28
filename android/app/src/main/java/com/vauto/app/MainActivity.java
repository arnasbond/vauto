package com.vauto.app;

import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.ComponentCallbacks2;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.util.Log;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.File;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "VautoMainActivity";
    private boolean jsBridgeAttached = false;
    private static boolean httpCachePurgedThisProcess = false;

    private ValueCallback<Uri[]> pendingFilePathCallback;
    private ActivityResultLauncher<Intent> imageFileChooserLauncher;
    private long pendingApkDownloadId = -1L;
    private BroadcastReceiver apkDownloadReceiver;
    private boolean majorUpdateDialogVisible = false;

    private static final String HOST_LOCALHOST = "localhost";
    private static final String HOST_VERCEL = "vauto-chi.vercel.app";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        imageFileChooserLauncher =
            registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                result -> {
                    if (pendingFilePathCallback == null) return;
                    Uri[] uris = null;
                    if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                        Intent data = result.getData();
                        if (data.getClipData() != null) {
                            int count = data.getClipData().getItemCount();
                            uris = new Uri[count];
                            for (int i = 0; i < count; i++) {
                                uris[i] = data.getClipData().getItemAt(i).getUri();
                            }
                        } else if (data.getData() != null) {
                            uris = new Uri[] { data.getData() };
                        }
                    }
                    pendingFilePathCallback.onReceiveValue(uris);
                    pendingFilePathCallback = null;
                }
            );
        registerApkDownloadReceiver();
    }

    @Override
    public void onDestroy() {
        unregisterApkDownloadReceiver();
        super.onDestroy();
    }

    /** Native AlertDialog + background APK download for major version jumps (versionCode gap > 1). */
    void promptMajorUpdate(String versionLabel, String downloadUrl) {
        if (downloadUrl == null || downloadUrl.trim().isEmpty()) return;
        if (majorUpdateDialogVisible) return;
        runOnUiThread(() -> {
            majorUpdateDialogVisible = true;
            new AlertDialog.Builder(this)
                .setTitle("VAUTO atnaujinimas")
                .setMessage(
                    "Paruoštas svarbus VAUTO atnaujinimas. Spauskite atnaujinti, kad aktyvuotumėte naujas funkcijas."
                )
                .setCancelable(false)
                .setPositiveButton(
                    "Atnaujinti",
                    (dialog, which) -> startApkDownload(downloadUrl.trim())
                )
                .setNegativeButton(
                    "Vėliau",
                    (dialog, which) -> majorUpdateDialogVisible = false
                )
                .setOnDismissListener(dialog -> majorUpdateDialogVisible = false)
                .show();
        });
    }

    void clearWebViewDiskCache() {
        runOnUiThread(() -> {
            Bridge bridge = getBridge();
            if (bridge == null) return;
            WebView webView = bridge.getWebView();
            if (webView == null) return;
            try {
                webView.clearCache(true);
                Log.i(TAG, "WebView disk cache cleared (deep refresh)");
            } catch (Exception e) {
                Log.w(TAG, "WebView cache clear failed", e);
            }
        });
    }

    private void registerApkDownloadReceiver() {
        if (apkDownloadReceiver != null) return;
        apkDownloadReceiver =
            new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (intent == null) return;
                    long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
                    if (id != pendingApkDownloadId) return;
                    pendingApkDownloadId = -1L;
                    installDownloadedApk(id);
                }
            };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(apkDownloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(apkDownloadReceiver, filter);
        }
    }

    private void unregisterApkDownloadReceiver() {
        if (apkDownloadReceiver == null) return;
        try {
            unregisterReceiver(apkDownloadReceiver);
        } catch (Exception e) {
            Log.w(TAG, "APK download receiver unregister failed", e);
        }
        apkDownloadReceiver = null;
    }

    private void startApkDownload(String downloadUrl) {
        majorUpdateDialogVisible = false;
        try {
            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            if (dm == null) {
                openExternalUrlFallback(downloadUrl);
                return;
            }

            File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir != null && !dir.exists()) {
                //noinspection ResultOfMethodCallIgnored
                dir.mkdirs();
            }

            DownloadManager.Request request =
                new DownloadManager.Request(Uri.parse(downloadUrl));
            request.setTitle("VAUTO atnaujinimas");
            request.setDescription("Atsisiunčiamas naujas VAUTO APK");
            request.setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
            );
            request.setDestinationInExternalFilesDir(
                this,
                Environment.DIRECTORY_DOWNLOADS,
                "vauto-update.apk"
            );

            pendingApkDownloadId = dm.enqueue(request);
            Log.i(TAG, "APK download started: " + downloadUrl);
        } catch (Exception e) {
            Log.w(TAG, "APK download failed, opening browser", e);
            openExternalUrlFallback(downloadUrl);
        }
    }

    private void installDownloadedApk(long downloadId) {
        DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        if (dm == null) return;

        DownloadManager.Query query = new DownloadManager.Query();
        query.setFilterById(downloadId);
        try (Cursor cursor = dm.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) return;
            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            if (statusIndex < 0) return;
            if (cursor.getInt(statusIndex) != DownloadManager.STATUS_SUCCESSFUL) return;

            Uri apkUri = dm.getUriForDownloadedFile(downloadId);
            if (apkUri == null) {
                int uriIndex = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI);
                if (uriIndex >= 0) {
                    String localUri = cursor.getString(uriIndex);
                    if (localUri != null) apkUri = Uri.parse(localUri);
                }
            }
            if (apkUri == null) return;
            launchApkInstallIntent(apkUri);
        } catch (Exception e) {
            Log.w(TAG, "APK install launch failed", e);
        }
    }

    private void launchApkInstallIntent(Uri apkUri) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!getPackageManager().canRequestPackageInstalls()) {
                    Intent settings =
                        new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    settings.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(settings);
                    return;
                }
            }

            Intent install = new Intent(Intent.ACTION_VIEW);
            install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            if ("file".equalsIgnoreCase(apkUri.getScheme())) {
                Uri contentUri =
                    FileProvider.getUriForFile(
                        this,
                        getPackageName() + ".fileprovider",
                        new File(apkUri.getPath())
                    );
                install.setDataAndType(contentUri, "application/vnd.android.package-archive");
            } else {
                install.setDataAndType(apkUri, "application/vnd.android.package-archive");
            }

            startActivity(install);
        } catch (Exception e) {
            Log.w(TAG, "Unable to open APK installer", e);
        }
    }

    private void openExternalUrlFallback(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            Log.w(TAG, "openExternalUrlFallback failed: " + url, e);
        }
    }

    /** Opens the system image picker for WebView file inputs (e.g. listing photo upload). */
    void launchImageFileChooser(ValueCallback<Uri[]> callback, boolean allowMultiple) {
        if (pendingFilePathCallback != null) {
            pendingFilePathCallback.onReceiveValue(null);
        }
        pendingFilePathCallback = callback;

        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        if (allowMultiple) {
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }

        try {
            imageFileChooserLauncher.launch(
                Intent.createChooser(intent, "Pasirinkite nuotrauką")
            );
        } catch (ActivityNotFoundException e) {
            Log.w(TAG, "Image file chooser unavailable", e);
            pendingFilePathCallback.onReceiveValue(null);
            pendingFilePathCallback = null;
        }
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
            activity.runOnUiThread(() -> activity.openExternalUrlFallback(url));
        }

        @JavascriptInterface
        public void clearWebViewCache() {
            activity.clearWebViewDiskCache();
        }

        @JavascriptInterface
        public void promptMajorUpdate(String versionLabel, String downloadUrl) {
            activity.promptMajorUpdate(versionLabel, downloadUrl);
        }
    }
}
