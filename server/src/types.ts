export interface ApiUser {
  id: string;
  name: string;
  phone: string;
  city: string;
  avatar: string;
  email?: string;
  warned?: boolean;
  walletBalance?: number;
  role?: string;
  businessType?: string;
  soldCount?: number;
  authProvider?: string;
  companyName?: string;
  companyCode?: string;
  vatCode?: string;
  billingPlan?: string;
  billingModel?: string;
  serviceBaseCity?: string;
  serviceRadiusKm?: number;
  serviceNationwide?: boolean;
  serviceSpecialties?: string[];
  averageResponseMinutes?: number;
}

export interface ApiReview {
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

export interface ApiPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface ApiListing {
  id: string;
  title: string;
  price: number;
  priceLabel?: string;
  location: string;
  distanceKm: number;
  latitude?: number;
  longitude?: number;
  slug?: string;
  image: string;
  category: string;
  tags: string[];
  sellerId: string;
  createdAt: string;
  contact?: string;
  hasVideo?: boolean;
  expiresAt?: string;
  description?: string;
  attributes?: Record<string, string | string[] | undefined>;
  status?: string;
  banned?: boolean;
  vinVerified?: boolean;
  providerVerified?: boolean;
  promoted?: boolean;
  /** Minimali kaina, kuria AI dvynys gali derėtis */
  minNegotiationPrice?: number;
  /** AI kainų vertinimo patikimumas 0–100 */
  appraisalScore?: number;
  /** Vision anti-fraud — ar skelbimas patvirtintas */
  isVerified?: boolean;
  /** Reikia moderacijos peržiūros */
  requiresReview?: boolean;
  /** Google Images SEO alt tekstas */
  imageAlt?: string;
  /** Google Images SEO title atributas */
  imageTitle?: string;
  /** Demonstracinis katalogo įrašas */
  isDemo?: boolean;
}

export interface ApiChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
  readAt?: string;
}

export interface ApiChatThread {
  id: string;
  listingId: string;
  listingTitle: string;
  buyerId: string;
  sellerId: string;
  messages: ApiChatMessage[];
  escrowOffered: boolean;
  escrow?: ApiEscrowTransaction | null;
  lastReadAt?: string;
  smsFallbackSentFor?: string;
}

export interface ApiSupportReport {
  id: string;
  reporterId: string;
  reporterName: string;
  category: string;
  urgency: string;
  status: string;
  comment: string;
  listingId?: string;
  listingTitle?: string;
  chatId?: string;
  reportedUserId?: string;
  chatPreview?: string;
  createdAt: string;
  reporterEmail?: string;
  reporterPhone?: string;
  reportedUserName?: string;
  updatedAt?: string;
  messages?: unknown[];
  aiSummary?: string;
  aiSuggestedReply?: string;
  unreadByAdmin?: boolean;
  unreadByReporter?: boolean;
  aiPowered?: boolean;
}

export type ApiEscrowStatus =
  | "offered"
  | "paying"
  | "paid"
  | "label_sent"
  | "shipped"
  | "delivered"
  | "completed"
  | "disputed"
  | "cancelled";

export interface ApiEscrowTransaction {
  id: string;
  threadId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  status: ApiEscrowStatus;
  trackingCode?: string;
  expressEscrow24h?: boolean;
  deliveredToLockerAt?: string;
  claimDeadlineAt?: string;
  courierStatus?: string;
  courierProvider?: string;
  buyerProtectionFee?: number;
  buyerTotal?: number;
  stripePaymentIntentId?: string;
  shippingLabelId?: string;
  deliveryStatus?: string;
  buyerConfirmed?: boolean;
  shippingProvider?: string;
  shippingLockerId?: string;
  shippingLockerName?: string;
  createdAt: string;
  updatedAt: string;
}

export type ApiServiceUrgency = "today" | "this_week" | "flexible";

export interface ApiServiceLead {
  id: string;
  title: string;
  city: string;
  category: string;
  summary: string;
  urgency: ApiServiceUrgency;
  budgetHint: string;
  leadPrice: number;
  createdAt: string;
  hiddenContact: string;
  contactPhone?: string;
  requiredSpecialties: string[];
  source?: "demo" | "buyer";
  sourceUserId?: string;
  query?: string;
  opened?: boolean;
}
