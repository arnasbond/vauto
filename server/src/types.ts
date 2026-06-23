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
  createdAt: string;
  updatedAt: string;
}
