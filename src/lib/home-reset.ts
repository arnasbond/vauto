/** Dispatched when user taps bottom-nav Home — local UI should tear down search overlays. */
export const HOME_RESET_EVENT = "vauto:home-reset";

export function dispatchHomeReset(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(HOME_RESET_EVENT));
}

export function subscribeHomeReset(handler: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(HOME_RESET_EVENT, handler);
  return () => window.removeEventListener(HOME_RESET_EVENT, handler);
}
