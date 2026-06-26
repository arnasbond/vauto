import { Capacitor } from "@capacitor/core";
import { apiRegisterFcmToken } from "@/lib/api/wallet-reviews";
import { isDataApiEnabled } from "@/lib/api/config";
import { logWakeEvent } from "@/lib/wake-word-engine";

type NavigateFn = (url: string) => void;

let listenersAttached = false;

export async function registerNativePush(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !isDataApiEnabled()) return false;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    const perm = await PushNotifications.checkPermissions();
    const status =
      perm.receive === "granted"
        ? perm.receive
        : (await PushNotifications.requestPermissions()).receive;

    if (status !== "granted") return false;

    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };

      const regHandle = PushNotifications.addListener(
        "registration",
        async (token) => {
          const value = token.value;
          if (!value) {
            done(false);
            return;
          }
          const res = await apiRegisterFcmToken(value, Capacitor.getPlatform());
          logWakeEvent("fcm_registered", { platform: Capacitor.getPlatform() });
          done(res.ok);
        }
      );

      const errHandle = PushNotifications.addListener(
        "registrationError",
        () => {
          done(false);
        }
      );

      void PushNotifications.register().finally(() => {
        window.setTimeout(() => {
          void regHandle.then((h) => h.remove());
          void errHandle.then((h) => h.remove());
          done(false);
        }, 15_000);
      });
    });
  } catch {
    return false;
  }
}

/** Open listing when user taps a push notification (Android/iOS). */
export function attachNativePushNavigation(navigate: NavigateFn): void {
  if (!Capacitor.isNativePlatform() || listenersAttached) return;
  listenersAttached = true;

  void import("@capacitor/push-notifications").then(({ PushNotifications }) => {
    void PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action) => {
        const data = action.notification.data as {
          url?: string;
          listingId?: string;
          chatId?: string;
          type?: string;
        };
        const url =
          data?.url ||
          (data?.chatId
            ? `/pokalbiai/?id=${encodeURIComponent(data.chatId)}`
            : undefined);
        if (url) {
          logWakeEvent("fcm_notification_open", { url });
          navigate(url.startsWith("/") ? url : `/${url}`);
        }
      }
    );
  });
}

export function isNativePushSupported(): boolean {
  return Capacitor.isNativePlatform();
}
