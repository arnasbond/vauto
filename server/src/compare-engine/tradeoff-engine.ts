/**
 * Allowlisted pros/cons per listing from deterministic comparisons.
 */

import type { ComparisonListingSnapshot } from "./schema.js";
import type { CompareTradeoffCode } from "./types.js";

export type ListingTradeoffRow = {
  listingId: string;
  pros: CompareTradeoffCode[];
  cons: CompareTradeoffCode[];
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function conditionRank(c: unknown): number | null {
  if (typeof c !== "string") return null;
  const n = c.toLowerCase();
  if (n === "new" || n === "nauja") return 3;
  if (n === "like_new" || n === "kaip nauja") return 2;
  if (n === "used" || n === "naudota") return 1;
  if (n === "for_parts") return 0;
  return 1;
}

/**
 * Relative tradeoffs vs the peer set (not absolute winner claims).
 */
export function computeTradeoffs(
  listings: ComparisonListingSnapshot[]
): ListingTradeoffRow[] {
  return listings.map((self) => {
    const pros: CompareTradeoffCode[] = [];
    const cons: CompareTradeoffCode[] = [];
    const others = listings.filter((l) => l.listingId !== self.listingId);

    // Price
    const prices = others
      .map((o) => o.askingPrice)
      .filter((p): p is number => p != null);
    if (self.askingPrice != null && prices.length) {
      if (self.askingPrice <= Math.min(...prices)) pros.push("LOWER_PRICE");
      if (self.askingPrice > Math.max(...prices)) cons.push("HIGHER_PRICE");
    }

    // Year
    const years = others
      .map((o) => num(o.attributes.year))
      .filter((y): y is number => y != null);
    const selfYear = num(self.attributes.year);
    if (selfYear != null && years.length) {
      if (years.every((y) => selfYear >= y)) pros.push("NEWER_YEAR");
      if (years.every((y) => selfYear <= y) && years.some((y) => y > selfYear)) {
        cons.push("OLDER_YEAR");
      } else if (years.every((y) => selfYear < y)) {
        cons.push("OLDER_YEAR");
      }
    }

    // Mileage
    const miles = others
      .map((o) => num(o.attributes.mileage))
      .filter((m): m is number => m != null);
    const selfMile = num(self.attributes.mileage);
    if (selfMile != null && miles.length) {
      if (miles.every((m) => selfMile <= m)) pros.push("LOWER_MILEAGE");
      if (miles.every((m) => selfMile >= m) && miles.some((m) => m < selfMile)) {
        cons.push("HIGHER_MILEAGE");
      } else if (miles.every((m) => selfMile > m)) {
        cons.push("HIGHER_MILEAGE");
      }
    }

    // Distance
    const dists = others
      .map((o) => num(o.attributes.distanceKm))
      .filter((d): d is number => d != null);
    const selfDist = num(self.attributes.distanceKm);
    if (selfDist != null && dists.length) {
      if (dists.every((d) => selfDist <= d)) pros.push("CLOSER_DISTANCE");
      if (dists.every((d) => selfDist > d)) cons.push("FARTHER_DISTANCE");
    }

    // VAUTO score
    const scores = others
      .map((o) => o.vautoScore)
      .filter((s): s is number => s != null);
    if (self.vautoScore != null && scores.length) {
      if (scores.every((s) => self.vautoScore! >= s)) pros.push("HIGHER_VAUTO_SCORE");
      if (scores.every((s) => self.vautoScore! < s)) cons.push("LOWER_VAUTO_SCORE");
    }

    // Buyer match
    const matches = others
      .map((o) => o.buyerMatchScore)
      .filter((s): s is number => s != null);
    if (self.buyerMatchScore != null && matches.length) {
      if (matches.every((s) => self.buyerMatchScore! >= s)) {
        pros.push("HIGHER_BUYER_MATCH");
      }
      if (matches.every((s) => self.buyerMatchScore! < s)) {
        cons.push("LOWER_MATCH");
      }
    }

    // Storage
    const stores = others
      .map((o) => num(o.attributes.storageGb))
      .filter((s): s is number => s != null);
    const selfStore = num(self.attributes.storageGb);
    if (selfStore != null && stores.length) {
      if (stores.every((s) => selfStore >= s)) pros.push("MORE_STORAGE");
      if (stores.every((s) => selfStore < s)) cons.push("LESS_STORAGE");
    }

    // Warranty / delivery
    const selfW = num(self.attributes.warrantyMonths);
    if (selfW != null && selfW > 0) pros.push("HAS_WARRANTY");
    else if (self.attributes.warrantyMonths === 0) cons.push("NO_WARRANTY");

    const selfDel = self.attributes.delivery;
    if (Array.isArray(selfDel) && selfDel.length > 0) pros.push("HAS_DELIVERY");
    else if (Array.isArray(selfDel) && selfDel.length === 0) cons.push("NO_DELIVERY");

    // Condition
    const selfCond = conditionRank(self.attributes.condition);
    const otherConds = others
      .map((o) => conditionRank(o.attributes.condition))
      .filter((c): c is number => c != null);
    if (selfCond != null && otherConds.length) {
      if (otherConds.every((c) => selfCond >= c)) pros.push("BETTER_CONDITION");
      if (otherConds.every((c) => selfCond < c)) cons.push("WORSE_CONDITION");
    }

    return {
      listingId: self.listingId,
      pros: [...new Set(pros)],
      cons: [...new Set(cons)],
    };
  });
}

export function buildKeyTakeaways(
  listings: ComparisonListingSnapshot[],
  tradeoffs: ListingTradeoffRow[],
  hasBuyerContext: boolean,
  contextualBestListingId: string | null
): string[] {
  const takes: string[] = [];
  takes.push(`Palyginta skelbimų: ${listings.length}.`);

  for (const row of tradeoffs) {
    if (row.pros.includes("LOWER_PRICE")) {
      takes.push(`${row.listingId}: žemesnė kaina tarp palyginamų.`);
    }
    if (row.pros.includes("NEWER_YEAR")) {
      takes.push(`${row.listingId}: naujesni metai.`);
    }
    if (row.pros.includes("LOWER_MILEAGE")) {
      takes.push(`${row.listingId}: mažesnė rida.`);
    }
  }

  if (!hasBuyerContext) {
    takes.push(
      "Be pirkėjo konteksto absoliutus „laimėtojas“ neskelbiamas — tik objektyvūs skirtumai."
    );
  } else if (contextualBestListingId) {
    takes.push(
      `Pagal Buyer Match kontekstą geriausiai tinka: ${contextualBestListingId}.`
    );
  }

  return takes.slice(0, 12);
}
