/**
 * VAUTO AI Core v2 — listingDetails capability (READ).
 *
 * Wraps the existing public listing lookup behind a clean, validating
 * capability contract. Read-only: no mutation, no consequential action.
 */
import { getPublicListingByIdOrSlug } from "../../../repository.js";
import type {
  CapabilityContext,
  CapabilityContract,
  CapabilityResult,
} from "../capability.js";

export interface ListingDetailsArgs {
  idOrSlug: string;
}

export interface ListingDetailsData {
  id: string;
  title: string;
  price: number;
  location: string;
  category: string;
}

export const listingDetailsCapability: CapabilityContract<
  ListingDetailsArgs,
  ListingDetailsData
> = {
  name: "listingDetails",
  description: "Perskaityti vieno skelbimo detales pagal id/slug.",
  operation: "READ",
  validate(raw: unknown): ListingDetailsArgs {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("listingDetails args must be an object");
    }
    const idOrSlug = (raw as Record<string, unknown>).idOrSlug;
    if (typeof idOrSlug !== "string" || !idOrSlug.trim()) {
      throw new Error("listingDetails requires a non-empty idOrSlug");
    }
    return { idOrSlug: idOrSlug.trim() };
  },
  async execute(
    args: ListingDetailsArgs,
    _ctx: CapabilityContext
  ): Promise<CapabilityResult<ListingDetailsData>> {
    try {
      const listing = await getPublicListingByIdOrSlug(args.idOrSlug);
      if (!listing) return { ok: false, error: "not_found" };
      return {
        ok: true,
        data: {
          id: listing.id,
          title: listing.title,
          price: listing.price,
          location: listing.location,
          category: listing.category,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "lookup failed" };
    }
  },
};
