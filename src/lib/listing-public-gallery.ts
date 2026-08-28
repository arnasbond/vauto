import type { Listing, ListingCategory } from "@/lib/types";
import {
  orderPublicListingGallery,
  parseExcludedGalleryImageUrls,
  parseListingPhotoClassifications,
} from "@vauto/shared/listing-gallery-order";

type GalleryListing = Pick<Listing, "images" | "category" | "attributes">;

function isValidUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("data:image/")) return true;
  if (trimmed.startsWith("blob:")) return true;
  return /^https?:\/\/.+/i.test(trimmed);
}

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = String(raw ?? "").trim();
    if (!isValidUrl(url) || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/**
 * Public gallery for cards/detail: drop tech-pasas / registration docs and
 * put the best exterior first when Vision roles are present.
 */
export function publicListingImageUrls(listing: GalleryListing): string[] {
  const raw = uniqueUrls(listing.images ?? []);
  if (!raw.length) return [];

  const attrs = listing.attributes ?? {};
  const classifications = parseListingPhotoClassifications(attrs.photoRoles);
  const excluded = parseExcludedGalleryImageUrls(attrs.excludedGalleryImageUrls);
  const coverHint = String(attrs.coverImageUrl ?? "").trim();

  let ordered = orderPublicListingGallery(raw, classifications, {
    excludedUrls: excluded,
  });

  // Legacy publishes may still have the doc as images[0] with no photoRoles.
  // Keep non-excluded order, but never let an explicitly excluded URL resurface.
  if (!ordered.length && raw.length) {
    ordered = raw.filter((u) => !excluded.includes(u));
  }

  if (coverHint && ordered.includes(coverHint)) {
    ordered = [coverHint, ...ordered.filter((u) => u !== coverHint)];
  }

  return ordered.slice(0, 6);
}

/** True when Vision (or prior sanitize) marked this URL as extraction-only. */
export function isExcludedListingGalleryUrl(
  listing: GalleryListing,
  url: string
): boolean {
  const excluded = parseExcludedGalleryImageUrls(
    listing.attributes?.excludedGalleryImageUrls
  );
  return excluded.includes(String(url ?? "").trim());
}

/**
 * Sample-based heuristic for LT green registration cards when photoRoles are missing.
 * Returns true when the image is likely a document, not a vehicle exterior.
 */
export async function imageLooksLikeRegistrationDocument(
  imageUrl: string
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const src = String(imageUrl ?? "").trim();
  if (!src || src.startsWith("blob:")) return false;

  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    const done = (value: boolean) => resolve(value);
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 48;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          done(false);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let greenish = 0;
        let samples = 0;
        for (let i = 0; i < data.length; i += 16) {
          const r = data[i] ?? 0;
          const g = data[i + 1] ?? 0;
          const b = data[i + 2] ?? 0;
          samples += 1;
          // LT tech-pasas / registracijos kortelė — dominant green paper.
          if (g > 90 && g > r + 18 && g > b + 12) greenish += 1;
        }
        done(samples > 0 && greenish / samples >= 0.28);
      } catch {
        done(false);
      }
    };
    img.onerror = () => done(false);
    img.src = src;
  });
}

/**
 * Pick a public cover URL for vehicle listings when Vision metadata is missing
 * (e.g. older publishes that still have tech-pasas as images[0]).
 */
export async function resolveBestPublicCoverUrl(
  listing: GalleryListing & { category: ListingCategory }
): Promise<string | null> {
  const gallery = publicListingImageUrls(listing);
  if (!gallery.length) return null;
  if (listing.attributes?.coverImageUrl || listing.attributes?.photoRoles) {
    return gallery[0] ?? null;
  }
  if (listing.category !== "vehicles" || gallery.length < 2) {
    return gallery[0] ?? null;
  }

  for (const url of gallery) {
    const isDoc = await imageLooksLikeRegistrationDocument(url);
    if (!isDoc) return url;
  }
  return gallery.find((u) => u !== gallery[0]) ?? gallery[0] ?? null;
}
