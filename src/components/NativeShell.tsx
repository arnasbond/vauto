"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { speakBuddyMessage, stopBuddySpeech } from "@/lib/buddy-voice";
import { logWakeEvent } from "@/lib/wake-word-engine";
import { attachNativePushNavigation } from "@/lib/native-push";
import { storeOAuthCallbackPayload } from "@/lib/auth/oauth-redirect";
import { attachNativeInstallLinkBlocker } from "@/lib/native-link-blocker";
import { ExpressEscrowProcessor } from "@/components/escrow/ExpressEscrowProcessor";
import { AppVersionGuard } from "@/components/version/AppVersionGuard";
import { NativeMajorUpdatePrompt } from "@/components/version/NativeMajorUpdatePrompt";
import { PullToRefreshHost } from "@/components/native/PullToRefreshHost";

/** Configures status bar, splash, PWA service worker, and push voice playback */
export function NativeShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    attachNativePushNavigation((path) => router.push(path));
  }, [router]);

  useEffect(() => {
    return attachNativeInstallLinkBlocker();
  }, []);

  // Native FCM disabled until google-services.json is in CI — no auto prompt after login.

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
      // Deep-link navigation: always route to the exact target when a url is
      // present (wishlist match, chat, deal), and speak the voice line if any.
      if (
        (data?.type === "VAUTO_NAVIGATE" || data?.type === "VAUTO_PLAY_VOICE") &&
        data.url
      ) {
        logWakeEvent("notification_navigate", { url: data.url });
        router.push(data.url);
      }
      if (data?.voiceText) {
        logWakeEvent("notification_voice_playback", { url: data.url });
        speakBuddyMessage(data.voiceText, { enabled: true });
      }
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    async function initNative() {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        // overlay:true crashes WebView on some Samsung foldables (One UI edge-to-edge)
        await StatusBar.setOverlaysWebView({ overlay: false });
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

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let removeState: (() => void) | undefined;
    let removeUrl: (() => void) | undefined;

    void import("@capacitor/app").then(({ App }) => {
      void App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) stopBuddySpeech();
      }).then((handle) => {
        removeState = () => void handle.remove();
      });

      void App.addListener("appUrlOpen", ({ url }) => {
        const payload = storeOAuthCallbackPayload(url);
        if (payload?.idToken) {
          router.replace("/");
          return;
        }
        try {
          const parsed = new URL(url);
          const chatId = parsed.searchParams.get("id");
          if (parsed.pathname.includes("pokalbiai") && chatId) {
            router.push(`/pokalbiai/?id=${encodeURIComponent(chatId)}`);
          }
        } catch {
          /* ignore malformed urls */
        }
      }).then((handle) => {
        removeUrl = () => void handle.remove();
      });
    });

    return () => {
      removeState?.();
      removeUrl?.();
    };
  }, [router]);

  return (
    <PullToRefreshHost>
      <ExpressEscrowProcessor />
      <NativeMajorUpdatePrompt />
      <AppVersionGuard />
      {children}
    </PullToRefreshHost>
  );
}
