import { Capacitor } from "@capacitor/core";

type VisibilityListener = (foreground: boolean) => void;

let foreground =
  typeof document === "undefined" || document.visibilityState === "visible";
const listeners = new Set<VisibilityListener>();
let nativeHooked = false;

function emit(next: boolean) {
  if (foreground === next) return;
  foreground = next;
  listeners.forEach((cb) => cb(next));
}

function hookBrowserVisibility() {
  if (typeof document === "undefined") return;
  document.addEventListener("visibilitychange", () => {
    emit(document.visibilityState === "visible");
  });
}

async function hookNativeAppState() {
  if (nativeHooked || !Capacitor.isNativePlatform()) return;
  nativeHooked = true;
  try {
    const { App } = await import("@capacitor/app");
    void App.addListener("appStateChange", ({ isActive }) => {
      emit(isActive);
    });
  } catch {
    /* plugin unavailable */
  }
}

if (typeof document !== "undefined") {
  hookBrowserVisibility();
  void hookNativeAppState();
}

export function isAppForeground(): boolean {
  return foreground;
}

/** Subscribe to foreground/background transitions (browser tab + native app). */
export function subscribeAppVisibility(listener: VisibilityListener): () => void {
  void hookNativeAppState();
  listeners.add(listener);
  return () => listeners.delete(listener);
}
