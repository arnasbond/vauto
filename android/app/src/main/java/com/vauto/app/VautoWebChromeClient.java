package com.vauto.app;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.util.PermissionHelper;
import java.util.Arrays;

/**
 * Grants WebView microphone/camera to the live site after Android runtime permissions.
 * Routes file inputs through MainActivity so gallery pickers work in Capacitor WebView.
 */
public class VautoWebChromeClient extends BridgeWebChromeClient {

    private final Bridge capBridge;

    public VautoWebChromeClient(Bridge bridge) {
        super(bridge);
        this.capBridge = bridge;
    }

    @Override
    public void onPermissionRequest(final PermissionRequest request) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            String[] resources = request.getResources();
            boolean wantsAudio =
                Arrays.asList(resources).contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE);
            boolean wantsVideo =
                Arrays.asList(resources).contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE);

            if (wantsAudio || wantsVideo) {
                String[] needed = buildRuntimePermissions(wantsAudio, wantsVideo);
                if (PermissionHelper.hasPermissions(capBridge.getContext(), needed)) {
                    request.grant(resources);
                    return;
                }
            }
        }
        super.onPermissionRequest(request);
    }

    @Override
    public boolean onShowFileChooser(
        WebView webView,
        ValueCallback<Uri[]> filePathCallback,
        FileChooserParams fileChooserParams
    ) {
        if (capBridge.getActivity() instanceof MainActivity activity) {
            boolean allowMultiple =
                fileChooserParams.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
            activity.launchImageFileChooser(filePathCallback, allowMultiple);
            return true;
        }
        return super.onShowFileChooser(webView, filePathCallback, fileChooserParams);
    }

    private static String[] buildRuntimePermissions(boolean audio, boolean video) {
        if (audio && video) {
            return new String[] {
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.MODIFY_AUDIO_SETTINGS,
                Manifest.permission.CAMERA,
            };
        }
        if (audio) {
            return new String[] {
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.MODIFY_AUDIO_SETTINGS,
            };
        }
        return new String[] { Manifest.permission.CAMERA };
    }
}
