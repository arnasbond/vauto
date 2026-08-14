/**
 * Compare Engine 1.0 — orchestration.
 * Client scores untrusted; server loads DB records; stale → STALE_SNAPSHOT.
 */

import { runBuyerMatch } from "../buyer-match/match-engine.js";
import type { MatchListingRecord } from "../buyer-match/types.js";
import { computeDeltas } from "./delta-engine.js";
import { buildTemplateSummary } from "./explanation.js";
import {
  isAuthorizedListing,
  isStaleSnapshot,
  resolveCompareCategory,
  toComparisonSnapshot,
} from "./listing-normalizer.js";
import {
  parseCompareRequest,
  parseCompareResponse,
  type CompareRequest,
  type CompareResponse,
} from "./schema.js";
import {
  buildKeyTakeaways,
  computeTradeoffs,
} from "./tradeoff-engine.js";
import type { CompareListingRecord } from "./types.js";
import { COMPARE_ENGINE_VERSION } from "./version.js";

export type CompareCatalogPort = {
  /** Load authorized records by ids from real DB — never LLM. */
  loadByIds: (ids: string[]) => Promise<CompareListingRecord[]> | CompareListingRecord[];
};

export type RunCompareInput = {
  request: CompareRequest;
  /** Prefer catalog port; or pass preloaded authorized rows (tests). */
  catalog?: CompareCatalogPort;
  listings?: CompareListingRecord[];
  snapshotCalculatedAt?: string;
};

function emptyResponse(
  status: CompareResponse["status"],
  at: string,
  warnings: string[],
  aiSummary: string
): CompareResponse {
  return parseCompareResponse({
    status,
    compareVersion: COMPARE_ENGINE_VERSION,
    comparedListings: [],
    deltas: {},
    tradeoffs: [],
    keyTakeaways: [],
    aiSummary,
    snapshotCalculatedAt: at,
    warnings,
    contextualBestListingId: null,
  });
}

function toMatchRecord(r: CompareListingRecord): MatchListingRecord {
  return {
    id: r.id,
    title: r.title,
    price: r.price ?? 0,
    location: "Vilnius",
    category: r.category,
    brand: r.brand,
    model: r.model,
    year: r.year,
    mileage: r.mileage,
    condition: r.condition,
    fuel: r.fuel,
    transmission: r.transmission,
    color: r.color,
    delivery: r.delivery,
    distanceKm: r.distanceKm,
    sellerVerified: null,
    vautoScore: r.vautoScore,
    createdAt: r.updatedAt,
    // Do not attach compare-engine hashes — 10F revalidation uses its own scheme.
    // Leaving snapshots unset avoids false STALE during contextual match.
  };
}

/**
 * Attach server-side Buyer Match scores when buyerContext is present.
 * Ignores any client-provided match/score on the request.
 */
function attachBuyerMatchScores(
  records: CompareListingRecord[],
  request: CompareRequest
): CompareListingRecord[] {
  if (!request.buyerContext?.hardConstraints) {
    return records.map((r) => ({
      ...r,
      // Strip any untrusted client-ish fields — keep only server values already on record
      buyerMatchScore: r.buyerMatchScore ?? null,
    }));
  }

  const matchListings = records.map(toMatchRecord);
  const matchRes = runBuyerMatch({
    request: {
      searchQuery: request.buyerContext.hardConstraints,
      preferences: request.buyerContext.preferences,
      candidateListingIds: records.map((r) => r.id),
    },
    listings: matchListings,
  });

  const scoreById = new Map(
    matchRes.rankedListings.map((r) => [r.listingId, r.matchScore])
  );

  return records.map((r) => ({
    ...r,
    buyerMatchScore: scoreById.get(r.id) ?? null,
  }));
}

export async function runCompareEngine(
  input: RunCompareInput
): Promise<CompareResponse> {
  const at = input.snapshotCalculatedAt ?? new Date().toISOString();

  let request: CompareRequest;
  try {
    request = parseCompareRequest(input.request);
  } catch {
    return emptyResponse(
      "INVALID_REQUEST",
      at,
      ["listingIds must contain 2–4 unique ids"],
      "Netinkama Compare užklausa (reikia 2–4 unikalių skelbimų ID)."
    );
  }

  let loaded: CompareListingRecord[];
  if (input.listings) {
    loaded = input.listings;
  } else if (input.catalog) {
    loaded = await input.catalog.loadByIds(request.listingIds);
  } else {
    return emptyResponse(
      "INVALID_REQUEST",
      at,
      ["missing catalog"],
      "Nėra DB katalogo palyginimui."
    );
  }

  // Only requested ids; drop unknowns / extras (anti-hallucination / IDOR surface)
  const byId = new Map(loaded.map((l) => [l.id, l]));
  const ordered: CompareListingRecord[] = [];
  const missing: string[] = [];
  for (const id of request.listingIds) {
    const row = byId.get(id);
    if (!row) missing.push(id);
    else ordered.push(row);
  }

  if (missing.length || ordered.length < 2) {
    return emptyResponse(
      "UNAUTHORIZED",
      at,
      missing.map((id) => `missing_or_unauthorized:${id}`),
      "Vienas ar keli skelbimai nerasti / neautorizuoti. Hallucinated ID neleidžiami."
    );
  }

  for (const r of ordered) {
    if (!isAuthorizedListing(r, request.requestUserId)) {
      return emptyResponse(
        "UNAUTHORIZED",
        at,
        [`unauthorized:${r.id}`],
        "Palyginimas atmestas dėl autorizacijos (IDOR apsauga)."
      );
    }
  }

  for (const r of ordered) {
    if (isStaleSnapshot(r)) {
      return emptyResponse(
        "STALE_SNAPSHOT",
        at,
        [`stale:${r.id}`],
        "STALE_SNAPSHOT: kaina ar kritiniai laukai pasikeitė. Atnaujinkite snapshot."
      );
    }
  }

  const withMatch = attachBuyerMatchScores(ordered, request);
  const mode = resolveCompareCategory(withMatch.map((r) => r.category));
  const snapshots = withMatch.map((r) => toComparisonSnapshot(r, mode));

  // Preserve request order — LLM cannot reorder facts
  const deltas = computeDeltas(snapshots);
  const tradeoffs = computeTradeoffs(snapshots);

  const hasBuyerContext = !!request.buyerContext?.hardConstraints;
  let contextualBestListingId: string | null = null;
  if (hasBuyerContext) {
    const scored = snapshots
      .filter((s) => s.buyerMatchScore != null)
      .sort((a, b) => (b.buyerMatchScore ?? 0) - (a.buyerMatchScore ?? 0));
    if (scored.length) contextualBestListingId = scored[0].listingId;
  }

  const keyTakeaways = buildKeyTakeaways(
    snapshots,
    tradeoffs,
    hasBuyerContext,
    contextualBestListingId
  );

  const draft: CompareResponse = {
    status: "AVAILABLE",
    compareVersion: COMPARE_ENGINE_VERSION,
    comparedListings: snapshots,
    deltas,
    tradeoffs,
    keyTakeaways,
    aiSummary: "",
    snapshotCalculatedAt: at,
    warnings: mode === "mixed" ? ["cross_category_compare"] : [],
    contextualBestListingId,
  };
  draft.aiSummary = buildTemplateSummary(draft);

  return parseCompareResponse(draft);
}

export function compareListingsSync(
  request: CompareRequest,
  listings: CompareListingRecord[],
  snapshotCalculatedAt?: string
): CompareResponse {
  const at = snapshotCalculatedAt ?? new Date().toISOString();
  let parsed: CompareRequest;
  try {
    parsed = parseCompareRequest(request);
  } catch {
    return emptyResponse(
      "INVALID_REQUEST",
      at,
      ["listingIds must contain 2–4 unique ids"],
      "Netinkama Compare užklausa (reikia 2–4 unikalių skelbimų ID)."
    );
  }

  const byId = new Map(listings.map((l) => [l.id, l]));
  const ordered: CompareListingRecord[] = [];
  const missing: string[] = [];
  for (const id of parsed.listingIds) {
    const row = byId.get(id);
    if (!row) missing.push(id);
    else ordered.push(row);
  }
  if (missing.length || ordered.length < 2) {
    return emptyResponse(
      "UNAUTHORIZED",
      at,
      missing.map((id) => `missing_or_unauthorized:${id}`),
      "Vienas ar keli skelbimai nerasti / neautorizuoti. Hallucinated ID neleidžiami."
    );
  }
  for (const r of ordered) {
    if (!isAuthorizedListing(r, parsed.requestUserId)) {
      return emptyResponse(
        "UNAUTHORIZED",
        at,
        [`unauthorized:${r.id}`],
        "Palyginimas atmestas dėl autorizacijos (IDOR apsauga)."
      );
    }
    if (isStaleSnapshot(r)) {
      return emptyResponse(
        "STALE_SNAPSHOT",
        at,
        [`stale:${r.id}`],
        "STALE_SNAPSHOT: kaina ar kritiniai laukai pasikeitė. Atnaujinkite snapshot."
      );
    }
  }

  const withMatch = attachBuyerMatchScores(ordered, parsed);
  const mode = resolveCompareCategory(withMatch.map((r) => r.category));
  const snapshots = withMatch.map((r) => toComparisonSnapshot(r, mode));
  const deltas = computeDeltas(snapshots);
  const tradeoffs = computeTradeoffs(snapshots);
  const hasBuyerContext = !!parsed.buyerContext?.hardConstraints;
  let contextualBestListingId: string | null = null;
  if (hasBuyerContext) {
    const scored = snapshots
      .filter((s) => s.buyerMatchScore != null)
      .sort((a, b) => (b.buyerMatchScore ?? 0) - (a.buyerMatchScore ?? 0));
    if (scored.length) contextualBestListingId = scored[0].listingId;
  }
  const keyTakeaways = buildKeyTakeaways(
    snapshots,
    tradeoffs,
    hasBuyerContext,
    contextualBestListingId
  );
  const draft: CompareResponse = {
    status: "AVAILABLE",
    compareVersion: COMPARE_ENGINE_VERSION,
    comparedListings: snapshots,
    deltas,
    tradeoffs,
    keyTakeaways,
    aiSummary: "",
    snapshotCalculatedAt: at,
    warnings: mode === "mixed" ? ["cross_category_compare"] : [],
    contextualBestListingId,
  };
  draft.aiSummary = buildTemplateSummary(draft);
  return parseCompareResponse(draft);
}
