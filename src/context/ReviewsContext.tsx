"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEMO_REVIEWS } from "@/data/mockReviews";
import { useAuth } from "@/context/AuthContext";
import { apiFetchReviews, apiSubmitReview } from "@/lib/api/wallet-reviews";
import { isDataApiEnabled } from "@/lib/api/config";
import { loadReviews, saveReviews } from "@/lib/storage";
import { logAnalytics } from "@/lib/analytics";
import type { SellerReview } from "@/lib/types";

interface ReviewsContextValue {
  reviews: SellerReview[];
  submitReview: (data: {
    listingId: string;
    listingTitle: string;
    sellerId: string;
    rating: number;
    comment?: string;
    tags?: string[];
  }) => void;
}

const ReviewsContext = createContext<ReviewsContextValue | null>(null);

export function ReviewsProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, updateUser } = useAuth();
  const [reviews, setReviews] = useState<SellerReview[]>(DEMO_REVIEWS);
  const [hydrated, setHydrated] = useState(false);
  const apiActive = isDataApiEnabled();

  useEffect(() => {
    async function load() {
      if (apiActive) {
        const res = await apiFetchReviews();
        if (res.ok) {
          setReviews(res.data);
        } else {
          const stored = loadReviews();
          if (stored?.length) setReviews(stored);
        }
      } else {
        const stored = loadReviews();
        if (stored?.length) setReviews(stored);
      }
      setHydrated(true);
    }
    void load();
  }, [apiActive]);

  useEffect(() => {
    if (!hydrated || apiActive) return;
    saveReviews(reviews);
  }, [reviews, hydrated, apiActive]);

  const submitReview = useCallback(
    (data: {
      listingId: string;
      listingTitle: string;
      sellerId: string;
      rating: number;
      comment?: string;
      tags?: string[];
    }) => {
      if (!isAuthenticated || user.id === "guest") return;
      const review: SellerReview = {
        id: `rev-${Date.now()}`,
        sellerId: data.sellerId,
        listingId: data.listingId,
        listingTitle: data.listingTitle,
        reviewerId: user.id,
        reviewerName: user.name,
        rating: data.rating,
        comment: data.comment?.trim() || undefined,
        tags: data.tags?.length ? data.tags : undefined,
        createdAt: new Date().toISOString(),
      };
      setReviews((prev) => [review, ...prev]);
      // Gamification: 1 free TOP boost token per submitted review.
      updateUser({
        freeTopBoostCredits: (user.freeTopBoostCredits ?? 0) + 1,
      });
      logAnalytics("review_submitted", {
        listingId: data.listingId,
        sellerId: data.sellerId,
        rating: data.rating,
        tags: data.tags?.join(",") ?? "",
        reward: "free_top_boost",
      });
      if (apiActive) {
        void apiSubmitReview(review).then((res) => {
          if (!res.ok) return;
          const rewardCredits = (
            res.data as SellerReview & {
              reward?: { freeTopBoostCredits?: number };
            }
          ).reward?.freeTopBoostCredits;
          if (typeof rewardCredits === "number") {
            updateUser({ freeTopBoostCredits: rewardCredits });
          }
        });
      }
    },
    [
      isAuthenticated,
      user.id,
      user.name,
      user.freeTopBoostCredits,
      apiActive,
      updateUser,
    ]
  );

  const value = useMemo(
    () => ({ reviews, submitReview }),
    [reviews, submitReview]
  );

  return (
    <ReviewsContext.Provider value={value}>{children}</ReviewsContext.Provider>
  );
}

export function useReviews(): ReviewsContextValue {
  const ctx = useContext(ReviewsContext);
  if (!ctx) throw new Error("useReviews must be used within ReviewsProvider");
  return ctx;
}
