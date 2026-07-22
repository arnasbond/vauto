/**
 * Split product gallery photos from document/evidence images
 * (tech passport, registration, receipts, ID papers).
 * Documents stay available for vision OCR but must never appear in public galleryUrls.
 */

export type ListingImageRole = "gallery" | "document" | "unknown";

const DOCUMENT_ROLE_HINT =
  /\b(tech[_\s-]?passport|registration|document|receipt|invoice|id[_\s-]?card|passport|registration_certificate|tech_passport|label_sticker)\b/i;

export function isDocumentImageRole(role: unknown): boolean {
  const r = String(role ?? "").trim().toLowerCase();
  if (!r) return false;
  if (r === "document" || r === "tech_passport" || r === "receipt" || r === "paper") {
    return true;
  }
  return DOCUMENT_ROLE_HINT.test(r);
}

/** Parse 0-based indexes from Gemini JSON (array of numbers or numeric strings). */
export function parseImageIndexList(raw: unknown, maxExclusive: number): number[] {
  if (!Array.isArray(raw) || maxExclusive <= 0) return [];
  const out: number[] = [];
  for (const item of raw) {
    const n = typeof item === "number" ? item : Number(String(item).trim());
    if (!Number.isInteger(n) || n < 0 || n >= maxExclusive) continue;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

export function splitGalleryAndDocumentUrls(
  imageUrls: string[],
  opts?: {
    documentImageIndexes?: unknown;
    galleryImageIndexes?: unknown;
    /** Existing document URLs already stored on the draft */
    knownDocumentUrls?: string[];
  }
): { galleryUrls: string[]; documentUrls: string[] } {
  const urls = imageUrls.map((u) => String(u ?? "").trim()).filter(Boolean);
  if (!urls.length) return { galleryUrls: [], documentUrls: [] };

  const knownDocs = new Set(
    (opts?.knownDocumentUrls ?? []).map((u) => u.trim()).filter(Boolean)
  );
  const docIdx = new Set(parseImageIndexList(opts?.documentImageIndexes, urls.length));
  const galIdx = parseImageIndexList(opts?.galleryImageIndexes, urls.length);
  const galIdxSet = new Set(galIdx);

  const documentUrls: string[] = [];
  const galleryUrls: string[] = [];

  urls.forEach((url, i) => {
    const forcedDoc = knownDocs.has(url) || docIdx.has(i);
    if (forcedDoc) {
      documentUrls.push(url);
      return;
    }
    if (galIdxSet.size > 0) {
      if (galIdxSet.has(i)) galleryUrls.push(url);
      else documentUrls.push(url);
      return;
    }
    galleryUrls.push(url);
  });

  // Safety: never empty the public gallery if every photo was tagged document.
  if (!galleryUrls.length && urls.length) {
    return { galleryUrls: [...urls], documentUrls: [] };
  }

  return {
    galleryUrls: uniquePreserveOrder(galleryUrls),
    documentUrls: uniquePreserveOrder(documentUrls),
  };
}

function uniquePreserveOrder(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/** Public listing gallery: drop known document URLs. */
export function filterPublicGalleryUrls(
  urls: readonly string[] | undefined,
  documentUrls?: readonly string[] | undefined
): string[] {
  const docs = new Set((documentUrls ?? []).map((u) => u.trim()).filter(Boolean));
  return uniquePreserveOrder(
    (urls ?? [])
      .map((u) => String(u ?? "").trim())
      .filter((u) => Boolean(u) && !docs.has(u))
  );
}

export function parseDocumentUrlsFromAttributes(
  attributes?: Record<string, string | string[] | undefined> | null
): string[] {
  if (!attributes) return [];
  const raw = attributes.documentImageUrls ?? attributes.documentUrls;
  if (Array.isArray(raw)) {
    return raw.map((u) => String(u ?? "").trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((u) => String(u ?? "").trim()).filter(Boolean);
      }
    } catch {
      return raw
        .split("|")
        .map((u) => u.trim())
        .filter(Boolean);
    }
  }
  return [];
}
