import { attributesToTags } from "@/lib/listing-attributes";
import { resolveEffectiveListingCategory } from "@/lib/listing-attribute-isolation";
import type { AiExtractedListing, Listing } from "@/lib/types";

export type ListingEditPatch = Partial<
  Pick<
    Listing,
    | "title"
    | "price"
    | "priceLabel"
    | "location"
    | "contact"
    | "description"
    | "category"
    | "tags"
    | "attributes"
    | "images"
    | "status"
  >
>;

export function listingToDraft(listing: Listing): AiExtractedListing {
  return {
    title: listing.title,
    price: listing.price,
    priceLabel: listing.priceLabel,
    location: listing.location,
    contact: listing.contact ?? "",
    category: listing.category,
    confidence: 1,
    description: listing.description,
    attributes: { ...(listing.attributes ?? {}) },
  };
}

export function draftToListingPatch(draft: AiExtractedListing): ListingEditPatch {
  const category = resolveEffectiveListingCategory(draft.category, draft.attributes ?? {});
  return {
    title: draft.title,
    price: draft.price,
    priceLabel: draft.priceLabel,
    location: draft.location,
    contact: draft.contact,
    description: draft.description,
    category,
    attributes: draft.attributes,
    tags: attributesToTags({ ...draft, category }),
  };
}
