/** Demo listings mirrored from the frontend mock data (idempotent seed). */
import { GENERATED_DEMO_LISTINGS } from "./generated-demo-listings.js";

export interface DemoListingRow {
  id: string;
  seller_id: string;
  title: string;
  price: number;
  price_label?: string;
  location: string;
  distance_km: number;
  image: string;
  category: string;
  tags: string[];
  has_video?: boolean;
  contact?: string;
  description?: string;
  attributes?: Record<string, string | string[]>;
  provider_verified?: boolean;
  vin_verified?: boolean;
}

export const DEMO_USER = {
  id: "user-1",
  name: "Jonas K.",
  phone: "+370 612 34567",
  city: "",
  avatar:
    "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop",
};

/** 100 listings — auto-generated from scripts/generate-mock-catalog.mjs */
export const DEMO_LISTINGS: DemoListingRow[] = GENERATED_DEMO_LISTINGS;
