import { Capacitor } from "@capacitor/core";

const DEFAULT_MS = 450;

/** Prevent ghost taps hitting links under a closing modal (BottomNav, APK download). */
export function blockNativeClickThrough(ms = DEFAULT_MS): void {
  if (typeof document === "undefined") return;
  if (!Capacitor.isNativePlatform()) return;

  document.body.style.pointerEvents = "none";
  window.setTimeout(() => {
    document.body.style.pointerEvents = "";
  }, ms);
}
