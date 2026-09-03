/**
 * Lightweight LLM context slicing — never re-inject data-URLs or bulky drafts.
 */

import {
  UNTRUSTED_VIN_MARKER_KEYS,
  VIN_REVIEW_MODEL_STATE_KEY,
} from "./vin-review";

const DATA_URL_RE = /^data:([^;]+);base64,/i;

/**
 * VIN keys that must never enter a model-visible prompt: every untrusted
 * value/marker key (canonical vin, candidate/conflict/review state, challenge,
 * scope, reviewId, confirmation receipt + timestamps) plus the generic
 * human-review state flag. Server-owned boundary redaction — applies even when
 * a client already strips some of these.
 */
const VIN_MODEL_HIDDEN_ATTR_KEYS = new Set<string>([
  ...UNTRUSTED_VIN_MARKER_KEYS,
  VIN_REVIEW_MODEL_STATE_KEY,
]);

/**
 * Phase 2D / F5 — deterministic field-conflict markers must also stay out of
 * the model-visible slice: conflict resolution is a deterministic reducer
 * (`resolveYearConflictPatch` / `resolveVerticalConflictPatch`), never an LLM
 * decision.
 */
const FIELD_CONFLICT_MODEL_HIDDEN_ATTR_KEYS = new Set<string>([
  "yearConflict",
  "yearConflictCandidate",
  "roomsConflict",
  "roomsConflictCandidate",
  "workTypeConflict",
  "workTypeConflictCandidate",
  // F9 — canonical fact-conflict markers stay out of the model-visible
  // slice: resolution is the deterministic reducer, never an LLM decision.
  "priceConflict",
  "priceConflictCandidate",
  "cityConflict",
  "cityConflictCandidate",
  "conditionConflict",
  "conditionConflictCandidate",
]);

const MODEL_HIDDEN_ATTR_KEYS = new Set<string>([
  ...VIN_MODEL_HIDDEN_ATTR_KEYS,
  ...FIELD_CONFLICT_MODEL_HIDDEN_ATTR_KEYS,
]);

/** Short-lived object handle instead of a full Base64 payload. */
export function slimImageHandle(url: string): string {
  const u = String(url ?? "").trim();
  if (!u) return "";
  if (u.startsWith("data:")) {
    const m = DATA_URL_RE.exec(u);
    const mime = m?.[1] ?? "image";
    return `handle:data:${mime}:len=${u.length}`;
  }
  if (/^https?:\/\//i.test(u)) {
    try {
      const parsed = new URL(u);
      return `handle:http:${parsed.origin}${parsed.pathname}`.slice(0, 180);
    } catch {
      return `handle:http:${u.slice(0, 120)}`;
    }
  }
  return `handle:other:${u.slice(0, 80)}`;
}

export function slimImageHandleList(
  urls: unknown,
  max = 6
): string[] {
  if (!Array.isArray(urls)) return [];
  return urls
    .map((u) => slimImageHandle(String(u ?? "")))
    .filter(Boolean)
    .slice(0, max);
}

/**
 * Model-visible upload marker. Raw URLs and Base64 payloads stay exclusively
 * in server tool context; the orchestrator needs only the bounded count to
 * decide that scanListingPhotos is required.
 */
export function buildPendingImagePromptMarker(
  urls: unknown,
  max = 10
): string {
  if (!Array.isArray(urls)) return "";
  const count = urls
    .map((url) => String(url ?? "").trim())
    .filter(Boolean)
    .slice(0, max).length;
  if (!count) return "";

  return `[Nuotraukos įkeltos — PRIVALOMA scanListingPhotos]\npending_image_count: ${count}\nimage_payload_location: server_tool_context_only`;
}

type DraftLike = {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
  category?: string;
  attributes?: Record<string, unknown>;
  orderedImageUrls?: string[];
  imageUrl?: string;
  listingFlowState?: string;
  allowPastomatas?: boolean;
};

/**
 * Compact listing draft for `[Vedlio kontekstas]` — metadata + handles only.
 */
export function slimListingDraftForLlm(draft: unknown): Record<string, unknown> | null {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return null;
  const d = draft as DraftLike;
  const attrs = d.attributes && typeof d.attributes === "object" ? d.attributes : {};
  const attrKeys = Object.keys(attrs).filter(
    (k) =>
      !MODEL_HIDDEN_ATTR_KEYS.has(k) &&
      !/^(deferredSalesDescription|attachedDocumentText|documentFacts|orderedImageUrls)$/i.test(
        k
      )
  );
  const slimAttrs: Record<string, string> = {};
  for (const k of attrKeys.slice(0, 24)) {
    const v = attrs[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (!s) continue;
    slimAttrs[k] = s.length > 120 ? `${s.slice(0, 117)}…` : s;
  }
  const desc = String(d.description ?? "").trim();
  const deferred = String(
    (attrs as Record<string, unknown>).deferredSalesDescription ?? ""
  ).trim();
  const docFacts = String(
    (attrs as Record<string, unknown>).attachedDocumentText ??
      (attrs as Record<string, unknown>).documentFacts ??
      ""
  ).trim();

  return {
    title: String(d.title ?? "").trim().slice(0, 120),
    descriptionChars: desc.length,
    descriptionPreview: desc ? desc.slice(0, 160) : "",
    deferredSalesChars: deferred.length,
    documentFactsChars: docFacts.length,
    price: typeof d.price === "number" ? d.price : undefined,
    location: String(d.location ?? "").trim().slice(0, 80),
    category: String(d.category ?? "").trim().slice(0, 64),
    listingFlowState: d.listingFlowState,
    allowPastomatas: d.allowPastomatas,
    imageHandles: slimImageHandleList(d.orderedImageUrls, 6),
    imageCount: Array.isArray(d.orderedImageUrls) ? d.orderedImageUrls.length : 0,
    attributes: slimAttrs,
  };
}

/** Cap document facts injected into Gemini text parts. */
export function slimDocumentFactsForLlm(raw: string, maxChars = 1200): string {
  const t = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > maxChars ? `${t.slice(0, maxChars - 1)}…` : t;
}
