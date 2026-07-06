import { Capacitor } from "@capacitor/core";
import { registerNativePush } from "@/lib/native-push";
import { registerWebPush } from "@/lib/web-push";

/**
 * Native Android/iOS uses Firebase Cloud Messaging (google-services.json).
 * Web / PWA uses VAPID keys from the Render API (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).
 */
export async function registerPushNotifications(
  savedQueries: string[] = []
): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    return registerNativePush();
  }
  return registerWebPush(savedQueries);
}

export function isPushNotificationsSupported(): boolean {
  return Capacitor.isNativePlatform() || typeof window !== "undefined";
}
