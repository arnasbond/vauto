import { Capacitor } from "@capacitor/core";

/** Light tactile tap — native FAB expand/collapse; no-op on web. */
export async function hapticImpactLight(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* plugin unavailable */
  }
}
