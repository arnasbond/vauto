export interface ApiUser {
  id: string;
  name: string;
  phone: string;
  city: string;
  avatar: string;
}

export interface ApiListing {
  id: string;
  title: string;
  price: number;
  priceLabel?: string;
  location: string;
  distanceKm: number;
  image: string;
  category: string;
  tags: string[];
  sellerId: string;
  createdAt: string;
  contact?: string;
  hasVideo?: boolean;
  expiresAt?: string;
}

export interface ApiChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
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
}

export type ApiEscrowStatus =
  | "offered"
  | "paying"
  | "paid"
  | "label_sent"
  | "completed"
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
