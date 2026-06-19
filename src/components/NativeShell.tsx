"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { speakBuddyMessage } from "@/lib/buddy-voice";
import { logWakeEvent } from "@/lib/wake-word-engine";

/** Configures status bar, splash, PWA service worker, and push voice playback */
export function NativeShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* offline shell optional */
      });
    }
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        voiceText?: string;
        url?: string;
      };
      if (data?.type === "VAUTO_PLAY_VOICE" && data.voiceText) {
        logWakeEvent("notification_voice_playback", { url: data.url });
        speakBuddyMessage(data.voiceText, { enabled: true });
      }
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
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
