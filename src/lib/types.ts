/** Core listing entity — extend when connecting to a real database */
export interface Listing {
  id: string;
  title: string;
  price: number;
  /** Display override e.g. "30€/val" */
  priceLabel?: string;
  location: string;
  distanceKm: number;
  image: string;
  category: ListingCategory;
  tags: string[];
  sellerId: string;
  createdAt: string;
  contact?: string;
  hasVideo?: boolean;
  /** ISO date when listing stops appearing in feed */
  expiresAt?: string;
}

export type ListingCategory =
  | "electronics"
  | "vehicles"
  | "services"
  | "home"
  | "other";

/** Fields extracted by the multimodal AI (GPT-4o mock) */
export interface AiExtractedListing {
  title: string;
  price: number;
  location: string;
  contact: string;
  category: ListingCategory;
  confidence: number;
}

/** Seller flow states */
export type SellerFlowStep =
  | "idle"
  | "recording"
  | "processing"
  | "confirmation"
  | "published";

export type SellerInputMode = "upload" | "voice" | "text" | "combined" | null;

/** Context-aware filter bubble generated from semantic search */
export interface DynamicFilter {
  id: string;
  label: string;
  /** Predicate applied when bubble is active */
  apply: (listing: Listing) => boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  phone: string;
  city: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
}

export interface ChatThread {
  id: string;
  listingId: string;
  listingTitle: string;
  buyerId: string;
  sellerId: string;
  messages: ChatMessage[];
  escrowOffered: boolean;
  escrow?: EscrowTransaction | null;
}

export type EscrowStatus =
  | "offered"
  | "paying"
  | "paid"
  | "label_sent"
  | "completed"
  | "cancelled";

export interface EscrowTransaction {
  id: string;
  threadId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  status: EscrowStatus;
  trackingCode?: string;
  createdAt: string;
  updatedAt: string;
}

/** Ranked listing with computed score for buyer feed */
export interface ScoredListing extends Listing {
  score: number;
  semanticRelevance: number;
  proximityScore: number;
  priceAttractiveness: number;
  recencyScore: number;
}
