import type { Listing, UserProfile, ChatThread } from "@/lib/types";
import { enrichListingCoords } from "@/lib/geocoding";
import { generateListingSlug } from "@/lib/seo";
import { isVerifiedServiceSeller, verifyVin } from "@/lib/trust";

export const MOCK_USER: UserProfile = {
  id: "user-1",
  name: "Jonas K.",
  avatar:
    "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop",
  phone: "+370 612 34567",
  city: "Panevėžys",
  role: "private",
  walletBalance: 0,
};

/** Mock listings aligned with design mockup */
const RAW_INITIAL_LISTINGS: Listing[] = [
  {
    id: "l-bike",
    title: "Dviratis 'Trek'",
    price: 150,
    location: "Panevėžys",
    distanceKm: 0.8,
    contact: "Tel. +3706...",
    image:
      "https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=400&h=300&fit=crop",
    category: "other",
    tags: ["dviratis", "trek", "sportas"],
    sellerId: "seller-bike",
    createdAt: "2026-06-18T10:00:00Z",
    hasVideo: true,
  },
  {
    id: "l-phone",
    title: "Mobilus telefonas",
    price: 220,
    location: "Panevėžys",
    distanceKm: 2.0,
    image:
      "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=300&fit=crop",
    category: "electronics",
    tags: ["telefonas", "mobilus", "pigus", "paaugliui"],
    sellerId: "seller-phone",
    createdAt: "2026-06-18T09:00:00Z",
    description: "Puikus ekranas, komplektas su įkrovikliu. Galima išbandyti vietoje.",
  },
  {
    id: "l-handyman",
    title: "Meistras — remonto paslaugos",
    price: 30,
    priceLabel: "30€/val",
    location: "Panevėžys",
    distanceKm: 3.0,
    image:
      "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400&h=300&fit=crop",
    category: "services",
    tags: ["meistras", "remontas", "paslauga"],
    sellerId: "seller-handyman",
    createdAt: "2026-06-18T08:00:00Z",
    hasVideo: true,
    providerVerified: true,
    description: "Remonto ir montavimo paslaugos Panevėžyje ir apylinkėse. Išrašome sąskaitas.",
  },
  {
    id: "l1",
    title: "iPhone 13 — puiki būklė",
    price: 320,
    location: "Vilnius",
    distanceKm: 2.1,
    image:
      "https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=400&h=300&fit=crop",
    category: "electronics",
    tags: ["telefonas", "iphone", "pigus", "paaugliui"],
    sellerId: "seller-1",
    createdAt: "2026-06-17T10:00:00Z",
  },
  {
    id: "l3",
    title: "Žolės pjovimas — greitai ir pigiai",
    price: 25,
    location: "Panevėžys",
    distanceKm: 1.2,
    image:
      "https://images.unsplash.com/photo-1558904541-efa843a96f01?w=400&h=300&fit=crop",
    category: "services",
    tags: ["žolė", "pjovimas", "sodas", "paslauga"],
    sellerId: "seller-3",
    createdAt: "2026-06-18T08:00:00Z",
    providerVerified: true,
  },
  {
    id: "l4",
    title: "VW Golf 2015 — mechaninė",
    price: 4500,
    location: "Šiauliai",
    distanceKm: 45,
    image:
      "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=400&h=300&fit=crop",
    category: "vehicles",
    tags: ["automobilis", "golf", "mechaninė", "pigus"],
    attributes: { vin: "WVWZZZ1KZAW123456", mileage: "185 000 km", fuelType: "Dyzelinas" },
    vinVerified: true,
    sellerId: "seller-4",
    createdAt: "2026-06-15T09:00:00Z",
  },
  {
    id: "l-job-offer",
    title: "Sandėlininkas — pilnas etatas",
    price: 1200,
    priceLabel: "1200€/mėn",
    location: "Panevėžys",
    distanceKm: 1.5,
    contact: "Tel. +3706...",
    image:
      "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=400&h=300&fit=crop",
    category: "jobs",
    tags: ["darbas", "sandėlis", "pilnas etatas"],
    attributes: {
      jobType: "Siūlau darbą",
      employmentType: "Pilnas etatas",
      salaryType: "Mėnesinis",
      schedule: "Pn–Pt 8–17",
      requirements: "B kategorijos vairuotojo pažymėjimas",
    },
    description: "Ieškome atsakingo sandėlininko logistikos centre.",
    sellerId: "seller-job-1",
    createdAt: "2026-06-18T07:00:00Z",
  },
  {
    id: "l-job-seek",
    title: "Ieškau darbo — vairuotojas / kurjeris",
    price: 900,
    priceLabel: "nuo 900€/mėn",
    location: "Vilnius",
    distanceKm: 4.2,
    contact: "Tel. +3706...",
    image:
      "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=400&h=300&fit=crop",
    category: "jobs",
    tags: ["ieškau darbo", "vairuotojas", "kurjeris"],
    attributes: {
      jobType: "Ieškau darbo",
      employmentType: "Pilnas etatas",
      salaryType: "Mėnesinis",
      requirements: "B kategorija, 3 m. patirtis",
    },
    description: "Patyręs vairuotojas, ieškau stabilaus darbo.",
    sellerId: "seller-job-2",
    createdAt: "2026-06-18T06:30:00Z",
  },
];

function prepareListing(listing: Listing): Listing {
  const withCoords = enrichListingCoords(listing);
  const slug = generateListingSlug(listing.title, listing.location);
  const vin =
    typeof listing.attributes?.vin === "string" ? listing.attributes.vin : undefined;
  return {
    ...withCoords,
    slug,
    contact: listing.contact ?? "+370 612 34567",
    description:
      listing.description ??
      `${listing.title} — ${listing.location}. Susisiekite dėl detalių.`,
    vinVerified: listing.vinVerified ?? (vin ? verifyVin(vin) : false),
    providerVerified:
      listing.providerVerified ?? isVerifiedServiceSeller(listing.sellerId),
  };
}

export const INITIAL_LISTINGS: Listing[] = RAW_INITIAL_LISTINGS.map(prepareListing);

export const INITIAL_CHATS: ChatThread[] = [
  {
    id: "chat-1",
    listingId: "l-phone",
    listingTitle: "Mobilus telefonas",
    buyerId: "user-1",
    sellerId: "seller-phone",
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
        senderId: "seller-phone",
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
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km away`;
}
