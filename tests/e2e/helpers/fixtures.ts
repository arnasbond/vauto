/** Minimal listing shape for enterprise E2E seeds (no app path imports). */
export interface E2EListing {
  id: string;
  title: string;
  price: number;
  priceLabel: string;
  location: string;
  category: string;
  description: string;
  images: string[];
  sellerId: string;
  sellerName: string;
  status: string;
  createdAt: string;
  slug: string;
  contact: string;
  tags: string[];
  attributes: Record<string, string | string[]>;
  allowPastomatas: boolean;
  promoted?: boolean;
  visibilityTier?: string;
}

export interface E2EChatMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
  status?: string;
}

export interface E2EChatThread {
  id: string;
  listingId: string;
  listingTitle: string;
  buyerId: string;
  sellerId: string;
  escrowOffered: boolean;
  messages: E2EChatMessage[];
}

export const E2E_SELLER_ID = "user-e2e-test";
export const E2E_BUYER_ID = "user-e2e-buyer";

export const E2E_COVER =
  "https://res.cloudinary.com/dhbrljo8v/image/upload/v1/vauto/e2e/cover-a.jpg";
export const E2E_GALLERY_2 =
  "https://res.cloudinary.com/dhbrljo8v/image/upload/v1/vauto/e2e/gallery-b.jpg";

/** Owned multi-photo listing — cover must stay images[0]. */
export function buildOwnedListing(
  overrides: Partial<E2EListing> = {}
): E2EListing {
  const images = [E2E_COVER, E2E_GALLERY_2];
  return {
    id: "e2e-owned-listing-1",
    title: "E2E Hohner akustine gitara",
    price: 120,
    priceLabel: "120 €",
    location: "Vilnius",
    category: "other",
    description: "E2E testinis skelbimas su dviem nuotraukomis.",
    images,
    sellerId: E2E_SELLER_ID,
    sellerName: "E2E Tester",
    status: "active",
    createdAt: new Date().toISOString(),
    slug: "e2e-hohner-gitara-vilnius",
    contact: "+37060000001",
    tags: ["gitara", "e2e"],
    attributes: {
      galleryUrls: images,
      fitsOmnivaLocker: "true",
      estimatedParcelSize: "M",
      skelbiuCategory: "Muzika › Gitaros",
      condition: "Naudotas",
    },
    allowPastomatas: true,
    ...overrides,
  };
}

export function buildChatThread(
  overrides: Partial<E2EChatThread> = {}
): E2EChatThread {
  const listing = buildOwnedListing();
  return {
    id: "e2e-chat-thread-1",
    listingId: listing.id,
    listingTitle: listing.title,
    buyerId: E2E_BUYER_ID,
    sellerId: E2E_SELLER_ID,
    escrowOffered: false,
    messages: [
      {
        id: "e2e-msg-seed",
        senderId: E2E_SELLER_ID,
        text: "Sveiki, kuo galiu padėti?",
        createdAt: new Date(Date.now() - 60_000).toISOString(),
        status: "delivered",
      },
    ],
    ...overrides,
  };
}

export function buildInvoiceSeed(userId: string) {
  return {
    id: "e2e-inv-1",
    number: "VAUTO-2099-0001",
    createdAt: new Date().toISOString(),
    userId,
    buyerName: "E2E Tester",
    buyerEmail: "e2e@vauto.lt",
    serviceTitle: "Skelbimo iškėlimas PLUS",
    serviceDescription: "E2E Stripe checkout simuliacija",
    amountNet: 4.13,
    vatRate: 0.21,
    vatAmount: 0.87,
    amountGross: 5,
    paymentMethod: "Stripe",
    checkoutKind: "b2c_promote",
    productId: "plus",
    listingId: "e2e-owned-listing-1",
  };
}
