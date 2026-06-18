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
}
