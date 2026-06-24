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
  /** Geocoded from location text at publish time */
  latitude?: number;
  longitude?: number;
  /** SEO-friendly URL segment */
  slug?: string;
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
  /** Matomumo pakopa 1–5 (fiksuota kainodara) */
  visibilityTier?: 1 | 2 | 3 | 4 | 5;
  /** ISO data kada baigiasi matomumo pakopa */
  visibilityExpiresAt?: string;
  /** Pro dashboard metrics */
  views?: number;
  clicks?: number;
  callClicks?: number;
  chatStarts?: number;
  saveCount?: number;
  interestScore?: number;
  banned?: boolean;
  /** Vehicles: mock VIN registry verification */
  vinVerified?: boolean;
  /** Services: verified provider badge */
  providerVerified?: boolean;
}

export type ListingCategory =
  | "electronics"
  | "vehicles"
  | "services"
  | "jobs"
  | "home"
  | "clothing"
  | "real_estate"
  | "other";

export type CategoryAttributes = Record<string, string | string[] | undefined>;

/** Fields extracted by the multimodal AI */
export interface AiExtractedListing {
  title: string;
  price: number;
  /** Display override e.g. "30€/val" — common for services */
  priceLabel?: string;
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

export type UserRole = "private" | "pro" | "admin";
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
  email?: string;
  warned?: boolean;
  memberSince?: string;
  soldCount?: number;
  companyName?: string;
  companyCode?: string;
  vatCode?: string;
  billingPlan?: "free" | "starter" | "pro";
  billingModel?: "ppc" | "subscription";
  serviceBaseCity?: string;
  serviceRadiusKm?: number;
  serviceNationwide?: boolean;
  serviceSpecialties?: string[];
  averageResponseMinutes?: number;
  /** Primary vehicle for parts/service voice context (Fleet memory). */
  primaryVehicle?: {
    make: string;
    model: string;
    year: number;
  };
}

export interface SellerReview {
  id: string;
  sellerId: string;
  listingId: string;
  listingTitle: string;
  reviewerId: string;
  reviewerName: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

export type ReportCategory =
  | "fraud"
  | "bad_info"
  | "chat_abuse"
  | "general_feedback"
  | "technical_issue"
  | "account_billing";

export type ReportUrgency = "critical" | "feedback" | "general";

export type ReportStatus = "open" | "resolved" | "dismissed";

export type ReportMessageRole = "user" | "admin" | "system" | "ai";

export interface ReportMessage {
  id: string;
  senderId: string;
  senderName: string;
  role: ReportMessageRole;
  text: string;
  timestamp: string;
  auto?: boolean;
}

export interface SupportReport {
  id: string;
  reporterId: string;
  reporterName: string;
  reporterEmail?: string;
  reporterPhone?: string;
  category: ReportCategory;
  urgency: ReportUrgency;
  status: ReportStatus;
  comment: string;
  listingId?: string;
  listingTitle?: string;
  chatId?: string;
  reportedUserId?: string;
  reportedUserName?: string;
  chatPreview?: string;
  createdAt: string;
  updatedAt?: string;
  messages?: ReportMessage[];
  aiSummary?: string;
  aiSuggestedReply?: string;
  unreadByAdmin?: boolean;
  unreadByReporter?: boolean;
  aiPowered?: boolean;
}

export interface AuthSession {
  isAuthenticated: boolean;
  provider?: AuthProvider;
  loggedInAt?: string;
  accessToken?: string;
  expiresAt?: string;
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
  readAt?: string;
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
  /** Last time current user viewed this thread */
  lastReadAt?: string;
  smsFallbackSentFor?: string;
}

export type EscrowStatus =
  | "offered"
  | "paying"
  | "paid"
  | "label_sent"
  | "shipped"
  | "delivered"
  | "completed"
  | "disputed"
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
  visualRelevance?: number;
}
