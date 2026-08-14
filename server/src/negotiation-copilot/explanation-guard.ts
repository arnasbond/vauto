/**
 * Ensure explanation text only cites numbers present in deterministic facts.
 */

import type { DeterministicBounds } from "./types.js";

const EUR_OR_CENTS_RE =
  /(\d+(?:[.,]\d+)?)\s*€|(\d+)\s*cent(?:ų|ai)?|(\d{2,})/gi;

function eurosFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Collect allowlisted numeric tokens from bounds (cents + euro strings + percents). */
export function allowedNumberTokens(bounds: DeterministicBounds): Set<string> {
  const set = new Set<string>();
  const addCents = (c: number | null) => {
    if (c == null) return;
    set.add(String(c));
    set.add(eurosFromCents(c));
    set.add(eurosFromCents(c).replace(".", ","));
    set.add(String(Math.round(c / 100)));
  };
  addCents(bounds.askingCents);
  addCents(bounds.activeOfferCents);
  addCents(bounds.marketLowCents);
  addCents(bounds.marketMedianCents);
  addCents(bounds.marketHighCents);
  addCents(bounds.suggestedCounterMinCents);
  addCents(bounds.suggestedCounterMaxCents);
  if (bounds.deltaPercentVsAsking != null) {
    set.add(String(bounds.deltaPercentVsAsking));
    set.add(String(Math.abs(bounds.deltaPercentVsAsking)));
    set.add(String(Math.round(Math.abs(bounds.deltaPercentVsAsking))));
  }
  return set;
}

/**
 * Returns true if every significant number in text is allowlisted.
 * Small integers 0–20 (counts) are ignored.
 */
export function explanationNumbersAreGrounded(
  text: string,
  bounds: DeterministicBounds
): boolean {
  const allowed = allowedNumberTokens(bounds);
  const matches = text.matchAll(EUR_OR_CENTS_RE);
  for (const m of matches) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? "").replace(",", ".");
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    if (n >= 0 && n <= 20 && !raw.includes(".")) continue; // ignore small counts
    const asInt = String(Math.round(n));
    const asFixed = n.toFixed(2);
    const asCentsGuess = String(Math.round(n * 100));
    if (
      allowed.has(raw) ||
      allowed.has(asInt) ||
      allowed.has(asFixed) ||
      allowed.has(asCentsGuess) ||
      allowed.has(String(n))
    ) {
      continue;
    }
    return false;
  }
  return true;
}

/** Strip any invented large numbers not in allowlist. */
export function scrubUngroundedNumbers(
  text: string,
  bounds: DeterministicBounds
): string {
  if (explanationNumbersAreGrounded(text, bounds)) return text;
  // Fallback: rebuild from template without free-form numbers beyond bounds
  return text.replace(EUR_OR_CENTS_RE, (full, g1, g2, g3) => {
    const raw = (g1 ?? g2 ?? g3 ?? "").replace(",", ".");
    const n = Number(raw);
    if (n >= 0 && n <= 20 && !String(raw).includes(".")) return full;
    const allowed = allowedNumberTokens(bounds);
    if (
      allowed.has(raw) ||
      allowed.has(String(Math.round(n))) ||
      allowed.has(n.toFixed(2))
    ) {
      return full;
    }
    return "[suma]";
  });
}

/** Privacy: never mention sellerMin / buyerMax / secret floor phrasing. */
export function containsSecretBoundLeak(text: string): boolean {
  return /seller\s*min|buyer\s*max|slapta\s+rib|minimali\s+kaina\s+pardav|maksimali\s+kaina\s+pirk/i.test(
    text
  );
}
