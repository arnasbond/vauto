import { isNativeApp } from "@/lib/mobile-install";

/** Native WebView (Samsung Fold) — cap DOM/images to avoid OOM while browsing. */
export const NATIVE_GRID_INITIAL = 24;
export const NATIVE_GRID_STEP = 24;
export const NATIVE_MAP_MAX = 48;

export function shouldLimitNativeFeed(): boolean {
  return isNativeApp();
}

export function capNativeFeed<T>(items: T[], max: number): T[] {
  if (!shouldLimitNativeFeed() || items.length <= max) return items;
  return items.slice(0, max);
}
