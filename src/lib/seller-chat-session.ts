/**
 * Seller listing chat session flag — suppresses buyer search / "Jūsų noras"
 * proactive nudges while a fresh sell flow is active.
 *
 * P0-3 — Absolute fresh session isolation: when a new listing session starts,
 * bump the epoch so callers wipe search filters, preferredSizes pins, and
 * category search context. Buyer search state must never bleed into sell mode.
 */

let sellerListingChatActive = false;
let suppressNudgesUntilMs = 0;
/** Monotonic epoch — increments on every fresh seller listing session. */
let sellerListingSessionEpoch = 0;

export function getSellerListingSessionEpoch(): number {
  return sellerListingSessionEpoch;
}

/**
 * Hard-activate seller listing mode and bump isolation epoch.
 * Call from resetSellerChat / openAiSellerListingChat / beginFreshListingChatSession.
 */
export function beginAbsoluteFreshSellerListingSession(): number {
  sellerListingChatActive = true;
  suppressNudgesUntilMs = Date.now() + 2 * 60 * 1000;
  sellerListingSessionEpoch += 1;
  return sellerListingSessionEpoch;
}

export function markSellerListingChatActive(active: boolean): void {
  sellerListingChatActive = active;
  if (active) {
    // Also cover the brief window before `open` flips true.
    suppressNudgesUntilMs = Date.now() + 2 * 60 * 1000;
    sellerListingSessionEpoch += 1;
  }
}

export function isSellerListingChatActive(): boolean {
  return sellerListingChatActive || Date.now() < suppressNudgesUntilMs;
}

export function shouldSuppressBuyerProactiveNudges(): boolean {
  return isSellerListingChatActive();
}

/**
 * True while a fresh seller listing session must keep buyer search filters
 * (preferredSizes, category pins, sticky queries) fully wiped.
 */
export function shouldIsolateSellerListingFromSearch(): boolean {
  return isSellerListingChatActive();
}
