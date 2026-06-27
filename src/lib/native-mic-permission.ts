import { Capacitor } from "@capacitor/core";

/**
 * Android WebView: trigger system mic dialog via getUserMedia before SpeechRecognition.
 * Capacitor BridgeWebChromeClient maps this to RECORD_AUDIO runtime permission.
 */
export async function ensureNativeMicrophonePermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return false;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}
