import { Capacitor } from "@capacitor/core";
import { apiRegisterFcmToken } from "@/lib/api/wallet-reviews";
import { isDataApiEnabled } from "@/lib/api/config";
import { logWakeEvent } from "@/lib/wake-word-engine";

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

export function isNativePushSupported(): boolean {
  return Capacitor.isNativePlatform();
}
