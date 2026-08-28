/**
 * Public listing gallery rules:
 * - Registration / tech-passport documents are for AI extraction only — never in gallery.
 * - Cover (images[0]) must be the best full-vehicle exterior when available.
 */

export const LISTING_PHOTO_ROLES = [
  "exterior_hero",
  "exterior",
  "interior",
  "engine",
  "wheels",
  "detail",
  "damage",
  "registration_document",
  "label_sticker",
  "other",
] as const;

export type ListingPhotoRole = (typeof LISTING_PHOTO_ROLES)[number];

export interface ListingPhotoClassification {
  /** 0-based index into the upload batch (same order as imageUrls). */
  index: number;
  role: ListingPhotoRole;
  /** Higher = better cover candidate (0–1 typical). */
  heroScore: number;
}

const ROLE_SCORE_BOOST: Record<ListingPhotoRole, number> = {
  exterior_hero: 0.45,
  exterior: 0.35,
  detail: 0.05,
  interior: -0.25,
  engine: -0.3,
  wheels: -0.28,
  damage: -0.2,
  label_sticker: -0.35,
  other: 0,
  registration_document: -1,
};

const EXCLUDED_GALLERY_ROLES = new Set<ListingPhotoRole>(["registration_document"]);

const ROLE_ALIASES: Record<string, ListingPhotoRole> = {
  exterior_hero: "exterior_hero",
  hero: "exterior_hero",
  hero_front: "exterior_hero",
  hero_three_quarter: "exterior_hero",
  hero_side: "exterior",
  exterior: "exterior",
  exterior_side: "exterior",
  exterior_rear: "exterior",
  interior: "interior",
  cabin: "interior",
  engine: "engine",
  motor: "engine",
  wheels: "wheels",
  wheel: "wheels",
  tire: "wheels",
  detail: "detail",
  damage: "damage",
  damage_closeup: "damage",
  registration_document: "registration_document",
  tech_passport: "registration_document",
  tech_pasas: "registration_document",
  document: "registration_document",
  registracijos_liudijimas: "registration_document",
  label_sticker: "label_sticker",
  other: "other",
};

export function normalizeListingPhotoRole(raw: unknown): ListingPhotoRole {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return ROLE_ALIASES[key] ?? "other";
}

export function isRegistrationDocumentRole(role: unknown): boolean {
  return EXCLUDED_GALLERY_ROLES.has(normalizeListingPhotoRole(role));
}

export function isExcludedFromPublicGallery(role: unknown): boolean {
  return isRegistrationDocumentRole(role);
}

export function parseListingPhotoClassifications(raw: unknown): ListingPhotoClassification[] {
  if (!raw) return [];
  let rows: unknown = raw;
  if (typeof raw === "string") {
    try {
      rows = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(rows)) return [];
  const out: ListingPhotoClassification[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const index = Number(rec.index ?? rec.id);
    if (!Number.isFinite(index) || index < 0) continue;
    const role = normalizeListingPhotoRole(rec.role ?? rec.angleTag);
    const heroScore = Number(rec.heroScore);
    out.push({
      index: Math.floor(index),
      role,
      heroScore: Number.isFinite(heroScore) ? heroScore : 0.5,
    });
  }
  return out;
}

export function parseExcludedGalleryImageUrls(raw: unknown): string[] {
  if (!raw) return [];
  let rows: unknown = raw;
  if (typeof raw === "string") {
    try {
      rows = JSON.parse(raw);
    } catch {
      const single = raw.trim();
      return single ? [single] : [];
    }
  }
  if (!Array.isArray(rows)) return [];
  return rows.map((u) => String(u ?? "").trim()).filter(Boolean);
}

function uniqueUrls(urls: string[]): string[] {
  const out: string[] = [];
  for (const raw of urls) {
    const u = String(raw ?? "").trim();
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
}

function effectiveScore(c: ListingPhotoClassification): number {
  return c.heroScore + (ROLE_SCORE_BOOST[c.role] ?? 0);
}

/**
 * Order public gallery URLs: drop registration docs; put best exterior first.
 * When classifications are missing, keeps input order (caller should supply Vision roles).
 */
export function orderPublicListingGallery(
  imageUrls: string[],
  classifications?: ListingPhotoClassification[] | null,
  opts?: { excludedUrls?: string[] | null; max?: number }
): string[] {
  const urls = uniqueUrls(imageUrls);
  const max = opts?.max ?? 6;
  const banned = new Set(
    (opts?.excludedUrls ?? []).map((u) => String(u ?? "").trim()).filter(Boolean)
  );
  const withoutBanned = urls.filter((u) => !banned.has(u));
  if (!withoutBanned.length) return [];

  const classified = classifications?.length
    ? classifications
    : withoutBanned.map((_, index) => ({
        index,
        role: "other" as ListingPhotoRole,
        heroScore: Math.max(0, 1 - index * 0.05),
      }));

  const byIndex = new Map<number, ListingPhotoClassification>();
  for (const c of classified) {
    if (!byIndex.has(c.index)) byIndex.set(c.index, c);
  }

  const scored = withoutBanned
    .map((url, index) => {
      const c = byIndex.get(index) ?? {
        index,
        role: "other" as ListingPhotoRole,
        heroScore: Math.max(0, 1 - index * 0.05),
      };
      return { url, role: c.role, score: effectiveScore(c) };
    })
    .filter((row) => !isExcludedFromPublicGallery(row.role));

  if (!scored.length) return [];

  const hasExterior = scored.some(
    (row) => row.role === "exterior_hero" || row.role === "exterior"
  );
  scored.sort((a, b) => {
    if (hasExterior) {
      const aExt = a.role === "exterior_hero" || a.role === "exterior" ? 1 : 0;
      const bExt = b.role === "exterior_hero" || b.role === "exterior" ? 1 : 0;
      if (aExt !== bExt) return bExt - aExt;
    }
    return b.score - a.score;
  });

  return scored.map((row) => row.url).slice(0, max);
}

/** URLs classified as registration / tech-passport documents (extraction only). */
export function collectExcludedGalleryUrls(
  imageUrls: string[],
  classifications: ListingPhotoClassification[]
): string[] {
  const urls = uniqueUrls(imageUrls);
  const out: string[] = [];
  for (const c of classifications) {
    if (!isExcludedFromPublicGallery(c.role)) continue;
    const url = urls[c.index];
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
}

export function galleryOrderAttributes(input: {
  classifications: ListingPhotoClassification[];
  excludedUrls: string[];
  coverUrl?: string;
}): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (input.classifications.length) {
    attrs.photoRoles = JSON.stringify(input.classifications);
  }
  if (input.excludedUrls.length) {
    attrs.excludedGalleryImageUrls = JSON.stringify(input.excludedUrls);
  }
  if (input.coverUrl) {
    attrs.coverImageUrl = input.coverUrl;
  }
  return attrs;
}
