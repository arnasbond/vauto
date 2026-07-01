import { logProductionWarn } from "./production-log.js";

export const CONDUCTOR_SOURCES_ATTR = "conductorSources";
export const CONDUCTOR_MERGED_AT_ATTR = "conductorMergedAt";

const KNOWN_SOURCES = new Set([
  "agent",
  "seller",
  "barcode",
  "vehicle",
  "manual",
]);

export interface ConductorPublishLineage {
  sources: string[];
  mergedAt: number | null;
}

export function readConductorLineage(
  attributes?: Record<string, string | string[] | undefined>
): ConductorPublishLineage {
  const raw = attributes?.[CONDUCTOR_SOURCES_ATTR];
  const sources =
    typeof raw === "string"
      ? raw
          .split(",")
          .map((s) => s.trim())
          .filter((s) => KNOWN_SOURCES.has(s))
      : Array.isArray(raw)
        ? raw.filter((s) => KNOWN_SOURCES.has(s))
        : [];
  const mergedRaw = attributes?.[CONDUCTOR_MERGED_AT_ATTR];
  const mergedAt =
    typeof mergedRaw === "string" && mergedRaw.trim()
      ? Number.parseInt(mergedRaw, 10)
      : null;
  return {
    sources,
    mergedAt: mergedAt != null && Number.isFinite(mergedAt) ? mergedAt : null,
  };
}

/** Log conductor lineage on server publish (Phase 2 observability). */
export function logConductorPublishLineage(listing: {
  id: string;
  sellerId: string;
  category: string;
  attributes?: Record<string, string | string[] | undefined>;
}): void {
  const lineage = readConductorLineage(listing.attributes);
  if (!lineage.sources.length) return;
  logProductionWarn("conductor_publish", "listing publish lineage", {
    listingId: listing.id,
    sellerId: listing.sellerId,
    category: listing.category,
    sources: lineage.sources.join(","),
    mergedAt: lineage.mergedAt,
  });
}
