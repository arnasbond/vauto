import type { Listing, UserProfile, ChatThread } from "@/lib/types";
import { enrichListingCoords } from "@/lib/geocoding";
import { generateListingSlug } from "@/lib/seo";
import { resolveListingImage } from "@/lib/listing-image";
import { isVerifiedServiceSeller, verifyVin } from "@/lib/trust";
import { LITHUANIA_MOCK_CATALOG } from "@/data/lithuania-mock-catalog";

export const MOCK_USER: UserProfile = {
  id: "user-1",
  name: "Jonas K.",
  avatar:
    "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop",
  phone: "+370 612 34567",
  city: "",
  role: "private",
  walletBalance: 0,
};

/** Unauthenticated session — never used as buyer/seller identity */
export const ANONYMOUS_USER: UserProfile = {
  id: "guest",
  name: "Svečias",
  avatar:
    "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop",
  phone: "",
  city: "",
  role: "private",
  walletBalance: 0,
  primaryVehicle: {
    make: "Volvo",
    model: "V70",
    year: 2006,
  },
};

function prepareListing(listing: Listing): Listing {
  const withCoords = enrichListingCoords(listing);
  const slug = generateListingSlug(listing.title, listing.location);
  const vin =
    typeof listing.attributes?.vin === "string" ? listing.attributes.vin : undefined;
  let h = 0;
  for (let i = 0; i < listing.id.length; i++) h += listing.id.charCodeAt(i);
  const seedViews = 15 + (h % 120);
  return {
    ...withCoords,
    slug,
    image: resolveListingImage(listing),
    contact: listing.contact ?? "+370 612 34567",
    description:
      listing.description ??
      `${listing.title} — ${listing.location}. Susisiekite dėl detalių.`,
    views: listing.views ?? seedViews,
    callClicks: listing.callClicks ?? Math.max(1, Math.floor(seedViews * 0.08)),
    chatStarts: listing.chatStarts ?? Math.max(0, Math.floor(seedViews * 0.04)),
    saveCount: listing.saveCount ?? Math.max(0, Math.floor(seedViews * 0.03)),
    vinVerified: listing.vinVerified ?? (vin ? verifyVin(vin) : false),
    providerVerified:
      listing.providerVerified ?? isVerifiedServiceSeller(listing.sellerId),
  };
}

/** 100 listings — vehicles, electronics and services across all Lithuania */
export const INITIAL_LISTINGS: Listing[] = LITHUANIA_MOCK_CATALOG.map(prepareListing);

export const INITIAL_CHATS: ChatThread[] = [
  {
    id: "chat-1",
    listingId: "lt-el-001",
    listingTitle: "iPhone 15 Pro 256 GB",
    buyerId: "user-1",
    sellerId: "seller-el-1",
    escrowOffered: false,
    messages: [
      {
        id: "m1",
        senderId: "user-1",
        text: "Labas! Ar telefonas dar prieinamas?",
        timestamp: "2026-06-18T09:00:00Z",
      },
      {
        id: "m2",
        senderId: "seller-el-1",
        text: "Taip, vis dar parduodu. Būklė puiki.",
        timestamp: "2026-06-18T09:02:00Z",
      },
      {
        id: "m3",
        senderId: "user-1",
        text: "Puiku, man tinka. Ar galėčiau paimti rytoj?",
        timestamp: "2026-06-18T09:05:00Z",
      },
    ],
  },
];

export function formatPrice(price: number, label?: string): string {
  if (label) return label;
  return (
    new Intl.NumberFormat("lt-LT", {
      maximumFractionDigits: 0,
    }).format(price) + "€"
  );
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

export function formatDistanceBadge(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}
