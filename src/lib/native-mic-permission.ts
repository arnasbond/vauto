import { Capacitor } from "@capacitor/core";

import { VAUTO_VOICE_INPUT_ENABLED } from "@/lib/feature-flags";

/**
 * Android WebView mic permission — disabled when voice input is off (silent no-op).
 */
export async function ensureNativeMicrophonePermission(): Promise<boolean> {
  if (!VAUTO_VOICE_INPUT_ENABLED) return false;
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
