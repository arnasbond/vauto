/**
 * TypeScript models mirroring database/schema.sql
 * Use with Drizzle/Prisma/raw SQL when backend is added.
 */

export type ListingCategory =
  | "electronics"
  | "vehicles"
  | "services"
  | "home"
  | "other";

export type ListingStatus = "draft" | "active" | "sold" | "archived";
export type SellerInputMode = "upload" | "voice";
export type SellerFlowStep =
  | "idle"
  | "recording"
  | "processing"
  | "confirmation"
  | "published";
export type EscrowStatus =
  | "offered"
  | "accepted"
  | "paid"
  | "released"
  | "cancelled"
  | "disputed";

export interface DbUser {
  id: string;
  name: string;
  phone: string;
  city: string;
  avatar_url: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  updated_at: string;
}

export interface DbListing {
  id: string;
  seller_id: string;
  title: string;
  price_cents: number;
  price_label: string | null;
  currency: string;
  location: string;
  lat: number | null;
  lng: number | null;
  category: ListingCategory;
  contact: string | null;
  has_video: boolean;
  status: ListingStatus;
  distance_km: number | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface DbListingMedia {
  id: string;
  listing_id: string;
  url: string;
  media_type: "image" | "video";
  sort_order: number;
  is_primary: boolean;
  created_at: string;
}

export interface DbChatThread {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  listing_title: string;
  escrow_offered: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbChatMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface DbEscrowTransaction {
  id: string;
  thread_id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount_cents: number;
  currency: string;
  status: EscrowStatus;
  offered_at: string;
  accepted_at: string | null;
  paid_at: string | null;
  released_at: string | null;
  cancelled_at: string | null;
}

export interface DbAiListingDraft {
  id: string;
  user_id: string;
  input_mode: SellerInputMode;
  flow_step: SellerFlowStep;
  title: string | null;
  price_cents: number | null;
  location: string | null;
  contact: string | null;
  category: ListingCategory | null;
  confidence: number | null;
  transcript: string | null;
  source_image_url: string | null;
  listing_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Map app Listing → DB insert shape */
export function listingToDb(
  listing: {
    title: string;
    price: number;
    priceLabel?: string;
    location: string;
    category: ListingCategory;
    contact?: string;
    sellerId: string;
    hasVideo?: boolean;
  },
  sellerId: string
): Omit<DbListing, "id" | "created_at" | "updated_at" | "published_at" | "distance_km" | "lat" | "lng"> {
  return {
    seller_id: sellerId,
    title: listing.title,
    price_cents: Math.round(listing.price * 100),
    price_label: listing.priceLabel ?? null,
    currency: "EUR",
    location: listing.location,
    category: listing.category,
    contact: listing.contact ?? null,
    has_video: listing.hasVideo ?? false,
    status: "active",
  };
}
