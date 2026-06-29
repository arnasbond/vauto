import { createHash } from "node:crypto";
import type { ImportedWardrobeItem } from "../ai/wardrobe-profile-importer.js";
import type { ApiListing, ApiUser } from "../types.js";

const CLOTHING_PLACEHOLDER =
  "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&h=600&fit=crop&auto=format";

const SYNC_CYCLE_DAYS = 3;

export function portalSyncIntervalMs(): number {
  return SYNC_CYCLE_DAYS * 24 * 60 * 60 * 1000;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function stableListingId(userId: string, portalKey: string, itemId: string): string {
  const raw = `${portalKey}-${userId}-${itemId}`;
  const hash = createHash("sha256").update(raw).digest("hex").slice(0, 12);
  return `portal-${portalKey}-${hash}`;
}

export function hashWardrobeItems(items: ImportedWardrobeItem[]): string {
  const payload = items
    .map((i) => `${i.id}|${i.title}|${i.price}|${i.imageUrl ?? ""}`)
    .sort()
    .join(";");
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

export function wardrobeItemsToListings(
  user: ApiUser,
  items: ImportedWardrobeItem[],
  portalKey: string,
  profileUrl: string
): ApiListing[] {
  const city = user.city?.trim() || "Vilnius";
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + 90 * 24 * 60 * 60 * 1000
  ).toISOString();

  return items.map((item, idx) => {
    const title = item.title.trim() || `Drabužis ${idx + 1}`;
    const slugBase = slugify(`${title}-${city}`);
    return {
      id: stableListingId(user.id, portalKey, item.id),
      sellerId: user.id,
      title,
      price: Math.max(1, Number(item.price) || 1),
      location: item.location?.trim() || city,
      distanceKm: 0.5,
      slug: slugBase ? `${slugBase}-${idx + 1}` : `drabuzis-${idx + 1}`,
      image: item.imageUrl?.trim() || CLOTHING_PLACEHOLDER,
      category: "clothing",
      tags: [item.brand, item.size, item.color].filter(Boolean) as string[],
      contact: user.phone,
      createdAt,
      expiresAt,
      description: item.description || title,
      attributes: {
        clothingType: "Moterims",
        fashionCategory: item.category,
        size: item.size,
        color: item.color,
        brand: item.brand,
        condition: item.condition,
        _portalSync: portalKey,
        _portalProfileUrl: profileUrl,
        _portalItemId: item.id,
      },
      status: "active",
      isVerified: true,
      requiresReview: false,
    };
  });
}
