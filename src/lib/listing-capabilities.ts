import type { Listing, ListingCategory } from "@/lib/types";
import { canUseShipping } from "@vauto/shared/marketplace-domain";

/**
 * Stage 18E — capability-driven listing cards.
 *
 * A listing's capabilities (delivery, on-site/remote service, location) must
 * reflect the object's vertical, not whichever component happened to be reused.
 *
 * Canonical source: the delivery/shipping capability is derived from the
 * canonical 13A capability model via `canUseShipping(category)` (which reads
 * `VERTICAL_CAPABILITIES[vertical].supportsShipping` and is fail-closed for
 * unknown categories). This module must NOT re-declare a local shipping-policy
 * registry — the canonical domain is the single source of truth. What lives
 * here is only a presentation adapter that formats canonical capability flags
 * into card signals.
 */

export interface ListingCapability {
  /** Human label in Lithuanian. */
  label: string;
  /** Canonical capability id. */
  id: string;
  /** Icon token mapped in the UI. */
  icon: "delivery" | "location" | "remote";
}

/**
 * Everything that can be shipped is derived from the canonical capability model.
 * `canUseShipping` is true only for canonical PHYSICAL_GOOD verticals whose
 * `supportsShipping` is declared (ELECTRONICS / HOME_GARDEN); it is fail-closed
 * (false) for services, jobs, real estate, transport and any unknown category.
 */
export function isShippableGoods(category: ListingCategory | undefined): boolean {
  if (category == null) return false;
  return canUseShipping(category);
}

/**
 * The delivery/shipping capability is applicable only when the canonical 13A
 * schema allows shipping for the object's vertical. Omniva must never appear on
 * real estate / services / jobs / vehicles.
 */
export function hasDeliveryCapability(
  listing: Pick<Listing, "category" | "allowPastomatas">
): boolean {
  if (!listing.category) return false;
  if (!canUseShipping(listing.category)) return false;
  return Boolean(listing.allowPastomatas);
}

/** The primary capability signal to show on a card, or null. */
export function primaryCapability(listing: Listing): ListingCapability | null {
  const cat = listing.category;

  // Physical goods → delivery (only when the canonical schema allows shipping).
  if (hasDeliveryCapability(listing)) {
    return { id: "delivery", label: "Pristatymas", icon: "delivery" };
  }

  // Real estate / services / jobs rely on location (or remote) rather than delivery.
  if (cat === "real_estate" || cat === "services" || cat === "rental") {
    // Remote-first services show a remote signal when flagged.
    if (cat === "services" && isRemoteService(listing)) {
      return { id: "remote", label: "Nuotoliniu būdu", icon: "remote" };
    }
    return { id: "location", label: normalisedLocation(listing), icon: "location" };
  }

  if (cat === "jobs") {
    const type = locationTypeOf(listing);
    if (type === "remote") return { id: "remote", label: "Nuotolinis", icon: "remote" };
    if (type === "hybrid") return { id: "remote", label: "Hibridinis", icon: "remote" };
    return { id: "location", label: normalisedLocation(listing) || "Vieta", icon: "location" };
  }

  return null;
}

function isRemoteService(listing: Listing): boolean {
  const raw =
    listing.attributes?.["remote"] ??
    listing.attributes?.["nuotoliniu"] ??
    listing.attributes?.["deliveryType"] ??
    listing.attributes?.["serviceMode"];
  const text = String(raw ?? "").toLowerCase();
  return /\b(remote|nuotolinius|nuotoliniu|internetu|online)\b/.test(text);
}

function normalisedLocation(listing: Listing): string {
  const loc = listing.location?.trim();
  return loc || "Vieta";
}

function locationTypeOf(listing: Listing): "remote" | "hybrid" | "onsite" | null {
  const raw = listing.attributes?.locationType ?? listing.attributes?.darboVieta;
  const text = String(raw ?? "").toLowerCase();
  if (/\bnuotolin|remote|home\b/.test(text)) return "remote";
  if (/\bhibrid|hybrid|mixed\b/.test(text)) return "hybrid";
  return null;
}
