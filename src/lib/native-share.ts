import { Capacitor } from "@capacitor/core";

export interface NativeSharePayload {
  title: string;
  text: string;
  url: string;
  dialogTitle?: string;
}

function isShareDismissed(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /cancel|dismiss|abort|closed/i.test(message);
}

/** Capacitor native shell — Share plugin is reliable where navigator.share is blocked in WebView. */
export function canUseCapacitorShare(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

export async function shareViaCapacitor(payload: NativeSharePayload): Promise<boolean> {
  if (!canUseCapacitorShare()) return false;
  try {
    const { Share } = await import("@capacitor/share");
    await Share.share({
      title: payload.title,
      text: payload.text,
      url: payload.url,
      dialogTitle: payload.dialogTitle ?? "Dalintis",
    });
    return true;
  } catch (error) {
    if (isShareDismissed(error)) return false;
    return false;
  }
}
