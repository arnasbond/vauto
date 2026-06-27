package com.vauto.app;

import android.Manifest;
import android.os.Build;
import android.webkit.PermissionRequest;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.util.PermissionHelper;
import java.util.Arrays;

/**
 * Grants WebView microphone/camera to the live site after Android runtime permissions.
 * Required for getUserMedia + Web Speech in Capacitor WebView shell.
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
