import type { SellerReview } from "@/lib/types";

export const DEMO_REVIEWS: SellerReview[] = [
  {
    id: "rev-1",
    sellerId: "seller-svc-1",
    listingId: "lt-svc-001",
    listingTitle: "Automobilio detailing — pilnas paketas",
    reviewerId: "user-demo-1",
    reviewerName: "Rasa M.",
    rating: 5,
    comment: "Puikus detailing, automobilis kaip iš salono.",
    createdAt: "2026-06-15T14:00:00Z",
  },
  {
    id: "rev-2",
    sellerId: "seller-svc-1",
    listingId: "lt-svc-001",
    listingTitle: "Automobilio detailing — pilnas paketas",
    reviewerId: "user-demo-2",
    reviewerName: "Darius L.",
    rating: 4,
    comment: "Kokybiškas darbas, rekomenduoju.",
    createdAt: "2026-06-10T11:30:00Z",
  },
  {
    id: "rev-3",
    sellerId: "seller-el-1",
    listingId: "lt-el-001",
    listingTitle: "iPhone 15 Pro 256 GB",
    reviewerId: "user-demo-3",
    reviewerName: "Gintarė P.",
    rating: 5,
    comment: "Telefonas kaip aprašyta, sandoris sklandus.",
    createdAt: "2026-06-12T16:00:00Z",
  },
];
