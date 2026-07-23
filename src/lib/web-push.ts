import { apiGetVapidPublicKey, apiSubscribePush, apiSyncAlertQueries } from "@/lib/api/wallet-reviews";
import { isDataApiEnabled } from "@/lib/api/config";
import { logWakeEvent } from "@/lib/wake-word-engine";
import { isNativePushDisabled } from "@/lib/mobile-install";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function registerWebPush(
  savedQueries: string[]
): Promise<boolean> {
  return ensureWebPushSubscription(savedQueries);
}

export async function ensureWebPushSubscription(
  savedQueries: string[] = []
): Promise<boolean> {
  if (isNativePushDisabled()) return false;
  if (typeof window === "undefined" || !isDataApiEnabled()) return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

  try {
    const vapid = await apiGetVapidPublicKey();
    if (!vapid.ok || !vapid.data.enabled || !vapid.data.publicKey) return false;

    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
    if (permission !== "granted") return false;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.data.publicKey),
      });
    }

    const json = sub.toJSON();
    const res = await apiSubscribePush(json);
    if (!res.ok) return false;

    if (savedQueries.length) {
      await apiSyncAlertQueries(savedQueries);
    }

    logWakeEvent("web_push_registered", { queries: savedQueries.length });
    return true;
  } catch (err) {
    // Cursor/Electron and some browsers reject push with AbortError —
    // never surface as an uncaught Next.js overlay.
    const msg = err instanceof Error ? err.message : String(err ?? "");
    console.warn("[web-push] subscription skipped:", msg);
    return false;
  }
}

export function isWebPushSupported(): boolean {
  if (isNativePushDisabled()) return false;
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}
