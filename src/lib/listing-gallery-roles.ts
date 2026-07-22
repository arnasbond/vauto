/**
 * Split product gallery photos from document/evidence images
 * (tech passport, registration, receipts, ID papers).
 * Documents stay available for vision OCR but must NEVER appear in public galleryUrls.
 */

export type ListingImageRole = "gallery" | "document" | "unknown";

const DOCUMENT_ROLE_HINT =
  /\b(tech[_\s-]?passport|registration|document|receipt|invoice|id[_\s-]?card|passport|registration_certificate|tech_passport|label_sticker|paper)\b/i;

export function isDocumentImageRole(role: unknown): boolean {
  const r = String(role ?? "").trim().toLowerCase();
  if (!r) return false;
  if (
    r === "gallery" ||
    r === "product" ||
    r === "car" ||
    r === "vehicle" ||
    r === "interior" ||
    r === "exterior"
  ) {
    return false;
  }
  if (
    r === "document" ||
    r === "tech_passport" ||
    r === "receipt" ||
    r === "paper" ||
    r === "doc"
  ) {
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

function parseImageRoles(raw: unknown, count: number): ListingImageRole[] {
  if (!Array.isArray(raw) || count <= 0) return [];
  const out: ListingImageRole[] = [];
  for (let i = 0; i < count; i++) {
    const role = raw[i];
    if (isDocumentImageRole(role)) out.push("document");
    else if (String(role ?? "").trim()) out.push("gallery");
    else out.push("unknown");
  }
  return out;
}

function uniquePreserveOrder(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const t = String(u ?? "").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function parseDocumentUrlsFromAttributes(
  attributes?: Record<string, string | string[] | undefined> | null
): string[] {
  if (!attributes) return [];
  const raw = attributes.documentImageUrls ?? attributes.documentUrls;
  if (Array.isArray(raw)) {
    return uniquePreserveOrder(raw.map((u) => String(u ?? "")));
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return uniquePreserveOrder(parsed.map((u) => String(u ?? "")));
      }
    } catch {
      return uniquePreserveOrder(raw.split("|"));
    }
  }
  return [];
}

/**
 * Split uploaded images into public gallery vs document evidence.
 * Documents win over gallery when signals conflict.
 * NEVER re-inject documents into gallery if the gallery would otherwise be empty.
 */
export function splitGalleryAndDocumentUrls(
  imageUrls: string[],
  opts?: {
    documentImageIndexes?: unknown;
    galleryImageIndexes?: unknown;
    imageRoles?: unknown;
    knownDocumentUrls?: string[];
  }
): { galleryUrls: string[]; documentUrls: string[] } {
  const urls = uniquePreserveOrder(imageUrls);
  if (!urls.length) return { galleryUrls: [], documentUrls: [] };

  const knownDocs = new Set(
    (opts?.knownDocumentUrls ?? []).map((u) => u.trim()).filter(Boolean)
  );
  const docIdx = new Set(parseImageIndexList(opts?.documentImageIndexes, urls.length));
  const galIdx = new Set(parseImageIndexList(opts?.galleryImageIndexes, urls.length));
  const roles = parseImageRoles(opts?.imageRoles, urls.length);

  const documentUrls: string[] = [];
  const galleryUrls: string[] = [];

  urls.forEach((url, i) => {
    const roleDoc = roles[i] === "document";
    const forcedDoc = knownDocs.has(url) || docIdx.has(i) || roleDoc;
    if (forcedDoc) {
      documentUrls.push(url);
      return;
    }
    if (galIdx.size > 0 && !galIdx.has(i)) {
      // Explicit gallery list present and this index was omitted → treat as document.
      documentUrls.push(url);
      return;
    }
    galleryUrls.push(url);
  });

  // Hard rule: never put document URLs into the public gallery, even if gallery emptied.
  const ban = new Set(documentUrls);
  const hardGallery = galleryUrls.filter((u) => !ban.has(u));

  return {
    galleryUrls: uniquePreserveOrder(hardGallery),
    documentUrls: uniquePreserveOrder(documentUrls),
  };
}

/** Absolute public-gallery strip — documents can never remain. */
export function hardFilterPublicGalleryUrls(
  urls: readonly string[] | undefined,
  documentUrls?: readonly string[] | undefined,
  attributes?: Record<string, string | string[] | undefined> | null
): string[] {
  const ban = new Set([
    ...(documentUrls ?? []).map((u) => String(u ?? "").trim()).filter(Boolean),
    ...parseDocumentUrlsFromAttributes(attributes),
  ]);
  return uniquePreserveOrder(
    (urls ?? [])
      .map((u) => String(u ?? "").trim())
      .filter((u) => Boolean(u) && !ban.has(u))
  );
}

/** @deprecated Prefer hardFilterPublicGalleryUrls — same behavior. */
export function filterPublicGalleryUrls(
  urls: readonly string[] | undefined,
  documentUrls?: readonly string[] | undefined
): string[] {
  return hardFilterPublicGalleryUrls(urls, documentUrls);
}
