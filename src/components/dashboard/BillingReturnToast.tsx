"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { apiConfirmBillingSession } from "@/lib/api/client";
import { normalizeListing } from "@/lib/listing-normalize";
import type { UserProfile } from "@/lib/types";

export function BillingReturnToast() {
  const searchParams = useSearchParams();
  const { showToast, updateUser, updateListing, apiActive } = useVauto();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;

    const billing = searchParams.get("billing");
    const promote = searchParams.get("promote");
    if (!billing && !promote) return;

    handledRef.current = true;

    const plan = searchParams.get("plan");
    const sessionId = searchParams.get("session_id");
    const listingId = searchParams.get("listing");

    const clearQuery = () => {
      window.history.replaceState({}, "", "/profile");
    };

    if (promote === "cancel") {
      showToast("Iškėlimo mokėjimas atšauktas", "info");
      clearQuery();
      return;
    }

    if (promote === "success") {
      const applyPromoteListing = (raw: unknown) => {
        if (!raw || typeof raw !== "object") return;
        const listing = normalizeListing(
          raw as Parameters<typeof normalizeListing>[0]
        );
        updateListing(listing.id, {
          promoted: listing.promoted,
          visibilityTier: listing.visibilityTier,
          visibilityExpiresAt: listing.visibilityExpiresAt,
          visibilityPlanTier: listing.visibilityPlanTier,
          attributes: listing.attributes,
          createdAt: listing.createdAt,
        });
      };

      if (apiActive && sessionId) {
        void apiConfirmBillingSession(sessionId).then((r) => {
          if (r.ok && r.data.listing) {
            applyPromoteListing(r.data.listing);
            showToast(r.data.message || "Skelbimo iškėlimas aktyvuotas!", "success");
          } else {
            showToast("Skelbimo iškėlimas aktyvuotas!", "success");
          }
          clearQuery();
        });
        return;
      }

      if (listingId) {
        showToast("Skelbimo iškėlimas aktyvuotas!", "success");
      }
      clearQuery();
      return;
    }

    const showSuccess = (message?: string) => {
      showToast(
        message ??
          (plan === "pro"
            ? "Pro planas aktyvuotas! Ačiū už prenumeratą."
            : "Starto planas aktyvuotas! Ačiū už prenumeratą."),
        "success"
      );
    };

    if (billing === "cancel") {
      showToast("Mokėjimas atšauktas", "info");
      clearQuery();
      return;
    }

    if (billing !== "success") return;

    const applyUser = (user: { billingPlan?: string; role?: string }) => {
      const patch: Partial<UserProfile> = {};
      if (user.billingPlan) {
        patch.billingPlan = user.billingPlan as UserProfile["billingPlan"];
      }
      if (user.role === "pro" || plan === "pro") {
        patch.role = "pro";
      }
      if (Object.keys(patch).length) updateUser(patch);
    };

    if (apiActive && sessionId) {
      void apiConfirmBillingSession(sessionId).then((r) => {
        if (r.ok) {
          if (r.data.user) applyUser(r.data.user);
          if (r.data.listing) {
            const listing = normalizeListing(r.data.listing);
            updateListing(listing.id, {
              promoted: listing.promoted,
              visibilityTier: listing.visibilityTier,
              visibilityExpiresAt: listing.visibilityExpiresAt,
              visibilityPlanTier: listing.visibilityPlanTier,
              attributes: listing.attributes,
              createdAt: listing.createdAt,
            });
          }
          showSuccess(r.data.message);
        } else {
          showSuccess();
        }
        clearQuery();
      });
      return;
    }

    showSuccess();
    clearQuery();
  }, [apiActive, searchParams, showToast, updateListing, updateUser]);

  return null;
}
