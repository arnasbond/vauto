export type ListingStatus = "active" | "sold";

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
  description?: string;
  attributes?: CategoryAttributes;
  status?: ListingStatus;
  promoted?: boolean;
  /** Pro dashboard metrics */
  views?: number;
  clicks?: number;
  interestScore?: number;
}

export type ListingCategory =
  | "electronics"
  | "vehicles"
  | "services"
  | "home"
  | "clothing"
  | "real_estate"
  | "other";

export type CategoryAttributes = Record<string, string | string[] | undefined>;

/** Fields extracted by the multimodal AI */
export interface AiExtractedListing {
  title: string;
  price: number;
  location: string;
  contact: string;
  category: ListingCategory;
  confidence: number;
  description?: string;
  attributes?: CategoryAttributes;
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

export type UserRole = "private" | "pro";
export type AuthProvider = "google" | "apple" | "phone";
export type ProBusinessType = "dealer" | "services" | "general";

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  phone: string;
  city: string;
  role?: UserRole;
  authProvider?: AuthProvider;
  businessType?: ProBusinessType;
  walletBalance?: number;
}

export interface AuthSession {
  isAuthenticated: boolean;
  provider?: AuthProvider;
  loggedInAt?: string;
}

export interface ServiceBooking {
  id: string;
  clientName: string;
  service: string;
  date: string;
  time: string;
}

export interface PromoteOffer {
  listingId: string;
  message: string;
  cost: number;
  durationDays: number;
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
