"use client";

/**
 * Legacy exports — marketplace feed now uses ListingCard 2.0.
 * Kept for SellerProfilePage / category portals that still import these names.
 */
import { ListingCard } from "@/components/marketplace/ListingCard";
import type { Listing } from "@/lib/types";

export function MarketplaceListRow({
  listing,
  priceColor,
}: {
  listing: Listing;
  priceColor: string;
}) {
  return (
    <ListingCard listing={listing} layout="list" priceColor={priceColor} />
  );
}

export function MarketplaceGridCard({
  listing,
  priceColor,
}: {
  listing: Listing;
  priceColor?: string;
}) {
  return (
    <ListingCard listing={listing} layout="grid" priceColor={priceColor} />
  );
}

export { ListingCard } from "@/components/marketplace/ListingCard";
