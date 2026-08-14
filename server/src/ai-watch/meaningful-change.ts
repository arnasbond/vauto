/**
 * Meaningful change classifier — punctuation / photo order alone is NOT enough.
 */

import type { WatchListingSnapshot } from "./types.js";

function normTitle(t: string): string {
  return String(t ?? "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type MeaningfulChangeResult = {
  meaningful: boolean;
  reasons: string[];
};

/**
 * Compare previous vs current snapshot.
 * Ignores: punctuation-only title edits, photoOrder reshuffles, description whitespace.
 */
export function classifyMeaningfulChange(
  previous: WatchListingSnapshot | null | undefined,
  current: WatchListingSnapshot | null | undefined,
  eventType: string
): MeaningfulChangeResult {
  if (eventType === "listing_created") {
    return { meaningful: true, reasons: ["created"] };
  }
  if (!previous || !current) {
    // Without prior snapshot, treat price_changed / status_changed as meaningful
    if (eventType === "price_changed" || eventType === "status_changed") {
      return { meaningful: true, reasons: [eventType] };
    }
    // listing_updated without snapshot — require explicit field evidence later
    return { meaningful: false, reasons: ["insufficient_snapshot"] };
  }

  const reasons: string[] = [];
  if (previous.price !== current.price) reasons.push("price");
  if ((previous.status ?? "active") !== (current.status ?? "active")) {
    reasons.push("status");
  }
  if ((previous.visibility ?? "public") !== (current.visibility ?? "public")) {
    reasons.push("visibility");
  }
  if ((previous.year ?? null) !== (current.year ?? null)) reasons.push("year");
  if ((previous.mileage ?? null) !== (current.mileage ?? null)) {
    reasons.push("mileage");
  }
  if ((previous.brand ?? null) !== (current.brand ?? null)) reasons.push("brand");
  if ((previous.model ?? null) !== (current.model ?? null)) reasons.push("model");

  const titleChanged = normTitle(previous.title) !== normTitle(current.title);
  if (titleChanged) reasons.push("title_substantive");

  // photoOrder / description-only → ignore
  return {
    meaningful: reasons.length > 0,
    reasons,
  };
}
