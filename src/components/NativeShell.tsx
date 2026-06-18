"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

/** Configures status bar, splash, and PWA service worker */
export function NativeShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* offline shell optional */
      });
    }
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    async function initNative() {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setOverlaysWebView({ overlay: true });
        await StatusBar.setStyle({ style: Style.Light });
        await StatusBar.setBackgroundColor({ color: "#00bfa5" });
      } catch {
        /* plugin unavailable in browser */
      }

      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await SplashScreen.hide();
      } catch {
        /* ignore */
      }
    }

    initNative();
  }, []);

  return <>{children}</>;
}
