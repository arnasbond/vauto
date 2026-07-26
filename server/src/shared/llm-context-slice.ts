/**
 * Lightweight LLM context slicing — never re-inject data-URLs or bulky drafts.
 */

const DATA_URL_RE = /^data:([^;]+);base64,/i;

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
