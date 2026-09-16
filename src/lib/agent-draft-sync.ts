/**
 * FC-1 — client-side canonical draft synchronization.
 *
 * Connects the EXISTING client to the EXISTING server contract
 * (POST /api/vauto-agent/draft/sync). The client proposes a minimal structured
 * delta under the server-issued threadId + version; the server owns canonical
 * state and validates identity + ownership + OCC. On success the client mirror
 * version is refreshed; on stale_version the client MUST NOT overwrite and must
 * re-discover the canonical draft.
 */
import {
  apiSyncListingDraft,
  type SyncListingDraftResult,
} from "@/lib/api/client";
import {
  readAgentThreadLink,
  persistAgentThreadLink,
} from "@/lib/agent-thread-link";
import { EPHEMERAL_LISTING_ATTR_KEYS } from "@vauto/shared/listing-attributes-sanitize";

export type { SyncListingDraftResult };

/**
 * Propose a draft delta to the canonical server draft for the current thread.
 * Uses the server-issued thread link (threadId + version) when the caller does
 * not supply them explicitly. Never authoritative — the server decides.
 */
export async function syncAgentListingDraft(input: {
  threadId?: string | null;
  expectedVersion?: number | null;
  delta: Record<string, unknown>;
}): Promise<SyncListingDraftResult> {
  const link = readAgentThreadLink();
  const threadId = input.threadId ?? link?.threadId;
  if (!threadId) {
    return { ok: false, code: "auth_required" };
  }
  const expectedVersion = input.expectedVersion ?? link?.version ?? undefined;
  const result = await apiSyncListingDraft({
    threadId,
    expectedVersion,
    delta: input.delta,
  });
  if (result.ok) {
    persistAgentThreadLink({ threadId, version: result.version });
    return result;
  }
  if (result.code === "stale_version") {
    // FC-1 — bounded single re-discovery on conflict. The newer server state
    // wins; the client only refreshes its mirror version so the NEXT proposal
    // uses the correct expectedVersion. There is deliberately NO retry of the
    // write — a retry could overwrite newer facts.
    const recovered = await reDiscoverAgentDraft(threadId);
    if (recovered.ok) {
      persistAgentThreadLink({ threadId, version: recovered.version });
      return {
        ok: false,
        code: "stale_version",
        error: "Newer canonical draft exists; client mirror refreshed.",
        draft: recovered.draft,
        version: recovered.version,
      };
    }
  }
  return result;
}

/** Recoverable refresh after a stale_version conflict — re-read the server
 *  canonical draft (the caller uses GET /draft or the next turn's thread). */
export async function reDiscoverAgentDraft(
  threadId: string
): Promise<SyncListingDraftResult> {
  const res = await fetch(`/api/vauto-agent/draft`, {
    method: "GET",
  });
  if (!res.ok) return { ok: false, code: "network" };
  const body = (await res.json()) as {
    drafts?: Array<{
      threadId: string;
      draft: Record<string, unknown> | null;
      version: number;
    }>;
  };
  const match = (body.drafts ?? []).find((d) => d.threadId === threadId);
  if (!match?.draft) return { ok: false, code: "not_found" };
  return { ok: true, draft: match.draft, version: match.version };
}

/** Client-only metadata keys that must NEVER be synced into canonical state
 *  (the server owns provenance/authority markers). This is a state-boundary
 *  whitelist, not a language classifier. It unions the canonical persist-safe
 *  exclusion set (ephemeral vision/social/VIN-candidate/conflict markers) with
 *  FC-1's client-local provenance markers. */
const CLIENT_META_ATTR_KEYS = new Set<string>([
  ...EPHEMERAL_LISTING_ATTR_KEYS,
  "editedByUser",
  "confirmationToken",
  "provenanceToken",
  "descriptionSource",
  "deferredSalesDescription",
  "deferredSalesDescriptionSource",
  "deferredSalesDescriptionProvenanceToken",
  "userCorrectedFields",
  "clientDraftId",
  "documentImageUrls",
  "documentImageCount",
  "documentRoles",
  "galleryRoles",
  "_vautoCategory",
  "_intent",
  "sellIntentActive",
  "awaitingSpecs",
  "visionFallback",
  "visionFallbackReason",
  "photoStyle",
  "sceneContext",
]);

/** FC-1 — build the MINIMAL structured delta from a client patch. Only
 *  whitelisted scalar fields + non-metadata attributes are proposed; the server
 *  still owns the canonical state and re-validates/whitelists again. */
export function buildSyncDelta(patch: Record<string, unknown>): Record<string, unknown> {
  const delta: Record<string, unknown> = {};
  const scalarKeys = [
    "title",
    "description",
    "price",
    "priceLabel",
    "location",
    "contact",
    "category",
    "allowPastomatas",
  ];
  for (const key of scalarKeys) {
    const value = patch[key];
    if (value !== undefined) delta[key] = value;
  }
  const attrs = patch.attributes;
  if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(attrs as Record<string, unknown>)) {
      if (CLIENT_META_ATTR_KEYS.has(k)) continue;
      clean[k] = v;
    }
    if (Object.keys(clean).length) delta.attributes = clean;
  }
  return delta;
}

/** Scalar syncable keys shared by manual edits and client enrichment. */
const SYNCABLE_SCALAR_KEYS = [
  "title",
  "description",
  "price",
  "priceLabel",
  "location",
  "contact",
  "category",
  "allowPastomatas",
] as const;

/** Normalize a syncable attribute value (string | string[]) for comparison so
 *  enrichment that flattens an array to a joined string is not mistaken for a
 *  meaningful change. */
function normalizeAttrValue(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(String).join(", ");
  return String(v);
}

function attrValueChanged(prev: unknown, next: unknown): boolean {
  return normalizeAttrValue(prev) !== normalizeAttrValue(next);
}

/**
 * FC-1 — compute the MINIMAL canonical delta that the client enrichment
 * introduced, i.e. `after` (final enriched draft) minus `before` (the incoming
 * server-derived draft). Only syncable scalar fields and non-metadata
 * attributes that actually changed are proposed; the server still owns the
 * canonical state and re-validates/whitelists. An unchanged field is omitted so
 * that an already-enriched canonical draft yields no delta (no sync loop).
 */
export function buildEnrichmentSyncDelta(
  before: object,
  after: object
): Record<string, unknown> {
  const prev = before as Record<string, unknown>;
  const next = after as Record<string, unknown>;
  const delta: Record<string, unknown> = {};
  for (const key of SYNCABLE_SCALAR_KEYS) {
    const a = next[key];
    const b = prev[key];
    if (a !== undefined && a !== b) delta[key] = a;
  }
  const beforeAttrs = (prev.attributes ?? {}) as Record<string, unknown>;
  const afterAttrs = (next.attributes ?? {}) as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(afterAttrs)) {
    if (CLIENT_META_ATTR_KEYS.has(k)) continue;
    if (v === undefined || v === null) continue;
    if (!attrValueChanged(beforeAttrs[k], v)) continue;
    clean[k] = v;
  }
  if (Object.keys(clean).length) delta.attributes = clean;
  return delta;
}

/** True when a computed delta carries at least one syncable canonical fact. */
export function hasSyncableDelta(delta: Record<string, unknown>): boolean {
  const attrs = delta.attributes;
  const hasAttr =
    attrs != null &&
    typeof attrs === "object" &&
    !Array.isArray(attrs) &&
    Object.keys(attrs).length > 0;
  if (hasAttr) return true;
  return SYNCABLE_SCALAR_KEYS.some((k) => delta[k] !== undefined);
}
