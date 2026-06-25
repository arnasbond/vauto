import type { LegacyListingInput, Listing, UserProfile, ChatThread } from "@/lib/types";
import { enrichListingCoords } from "@/lib/geocoding";
import { generateListingSlug } from "@/lib/seo";
import {
  listingImagesFromLegacy,
  resolveListingImages,
} from "@/lib/listing-image";
import { isVerifiedServiceSeller, verifyVin } from "@/lib/trust";
import type { FeedVisibilityTier } from "@/lib/feed-tier";
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

function mockFeedTier(id: string): FeedVisibilityTier {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const bucket = h % 100;
  if (bucket < 8) return "top";
  if (bucket < 22) return "plus";
  return "free";
}

function prepareListing(raw: LegacyListingInput): Listing {
  const withCoords = enrichListingCoords({
    ...raw,
    images: listingImagesFromLegacy(raw),
  } as Listing);
  const slug = generateListingSlug(withCoords.title, withCoords.location);
  const images = resolveListingImages(withCoords);
  const vin =
    typeof withCoords.attributes?.vin === "string" ? withCoords.attributes.vin : undefined;
  let h = 0;
  for (let i = 0; i < withCoords.id.length; i++) h += withCoords.id.charCodeAt(i);
  const seedViews = 15 + (h % 120);
  const feedTier = withCoords.visibilityTier ?? mockFeedTier(withCoords.id);
  return {
    ...withCoords,
    slug,
    images,
    contact: withCoords.contact ?? "+370 612 34567",
    description:
      withCoords.description ??
      `${withCoords.title} — ${withCoords.location}. Susisiekite dėl detalių.`,
    views: withCoords.views ?? seedViews,
    callClicks: withCoords.callClicks ?? Math.max(1, Math.floor(seedViews * 0.08)),
    chatStarts: withCoords.chatStarts ?? Math.max(0, Math.floor(seedViews * 0.04)),
    saveCount: withCoords.saveCount ?? Math.max(0, Math.floor(seedViews * 0.03)),
    vinVerified: withCoords.vinVerified ?? (vin ? verifyVin(vin) : false),
    providerVerified:
      withCoords.providerVerified ?? isVerifiedServiceSeller(withCoords.sellerId),
    visibilityTier: feedTier,
    promoted: withCoords.promoted ?? feedTier === "top",
  };
}

/** Panevėžio regiono Volvo V70 — radius filter QA (Panevėžys, Pasvalys, Biržai) */
const PANEVEZYS_REGION_VOLVO_V70: LegacyListingInput[] = [
  {
    id: "lt-auto-v70-pnv",
    title: "Volvo V70 2004",
    price: 4800,
    location: "Panevėžys",
    distanceKm: 2.1,
    contact: "Tel. +370 612 88001",
    image:
      "https://images.unsplash.com/photo-1605559425923-87f9a81ba9ba?w=800&h=600&fit=crop&auto=format",
    category: "vehicles",
    tags: ["volvo", "v70", "automobilis", "dyzelinas", "panevėžys"],
    description:
      "Volvo V70 2004 m. iš Panevėžys. Rida 245 600 km, dyzelinas, mechaninė. Tvarkinga techninė, vasarinės padangos. Vienas savininkas Lietuvoje.",
    sellerId: "seller-auto-pnv",
    createdAt: "2026-06-20T10:00:00.000Z",
    attributes: {
      make: "Volvo",
      model: "V70",
      year: "2004",
      mileage: "245 600 km",
      fuelType: "Dyzelinas",
      bodyType: "Universalas",
      transmission: "Mechaninė",
      taExpiry: "2026-08",
      vin: "YV1MW485241234567",
      defects: "Smulkūs kosmetiniai defektai",
    },
    vinVerified: true,
    providerVerified: false,
  },
  {
    id: "lt-auto-v70-psv",
    title: "Volvo V70 2006",
    price: 6750,
    location: "Pasvalys",
    distanceKm: 34.2,
    contact: "Tel. +370 612 88002",
    image:
      "https://images.unsplash.com/photo-1609521263040-d20fde4d0beb?w=800&h=600&fit=crop&auto=format",
    category: "vehicles",
    tags: ["volvo", "v70", "automobilis", "dyzelinas", "pasvalys"],
    description:
      "Volvo V70 2006 m. iš Pasvalys. Rida 198 400 km, dyzelinas, automatinė. Šildomos sėdynės, klimato kontrolė, xenon žibintai.",
    sellerId: "seller-auto-psv",
    createdAt: "2026-06-21T11:30:00.000Z",
    attributes: {
      make: "Volvo",
      model: "V70",
      year: "2006",
      mileage: "198 400 km",
      fuelType: "Dyzelinas",
      bodyType: "Universalas",
      transmission: "Automatinė",
      taExpiry: "2026-09",
      vin: "YV1MW485261234568",
      defects: "Nėra",
    },
    vinVerified: false,
    providerVerified: true,
  },
  {
    id: "lt-auto-v70-brz",
    title: "Volvo V70 2012",
    price: 9850,
    location: "Biržai",
    distanceKm: 48.5,
    contact: "Tel. +370 612 88003",
    image:
      "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop&auto=format",
    category: "vehicles",
    tags: ["volvo", "v70", "automobilis", "dyzelinas", "biržai"],
    description:
      "Volvo V70 2012 m. iš Biržai. Rida 156 200 km, dyzelinas, automatinė. Pilna serviso istorija, navigacija, parkavimo jutikliai.",
    sellerId: "seller-auto-brz",
    createdAt: "2026-06-22T14:15:00.000Z",
    attributes: {
      make: "Volvo",
      model: "V70",
      year: "2012",
      mileage: "156 200 km",
      fuelType: "Dyzelinas",
      bodyType: "Universalas",
      transmission: "Automatinė",
      taExpiry: "2026-11",
      vin: "YV1MW4852C1234569",
      defects: "Nėra",
    },
    vinVerified: true,
    providerVerified: false,
  },
];

/** 100+ listings — vehicles, electronics and services across all Lithuania */
export const INITIAL_LISTINGS: Listing[] = [
  ...LITHUANIA_MOCK_CATALOG.map(prepareListing),
  ...PANEVEZYS_REGION_VOLVO_V70.map(prepareListing),
];

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
