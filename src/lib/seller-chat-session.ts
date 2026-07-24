/**
 * Seller listing chat session flag — suppresses buyer search / "Jūsų noras"
 * proactive nudges while a fresh sell flow is active.
 */

let sellerListingChatActive = false;
let suppressNudgesUntilMs = 0;

export function markSellerListingChatActive(active: boolean): void {
  sellerListingChatActive = active;
  if (active) {
    // Also cover the brief window before `open` flips true.
    suppressNudgesUntilMs = Date.now() + 2 * 60 * 1000;
  }
}

export function isSellerListingChatActive(): boolean {
  return sellerListingChatActive || Date.now() < suppressNudgesUntilMs;
}

export function shouldSuppressBuyerProactiveNudges(): boolean {
  return isSellerListingChatActive();
}
