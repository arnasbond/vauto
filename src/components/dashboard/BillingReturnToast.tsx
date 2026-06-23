"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { apiConfirmBillingSession } from "@/lib/api/client";
import type { UserProfile } from "@/lib/types";

export function BillingReturnToast() {
  const searchParams = useSearchParams();
  const { showToast, updateUser, apiActive } = useVauto();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;

    const billing = searchParams.get("billing");
    if (!billing) return;

    handledRef.current = true;

    const plan = searchParams.get("plan");
    const sessionId = searchParams.get("session_id");

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
      window.history.replaceState({}, "", "/profile");
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
          applyUser(r.data.user);
          showSuccess(r.data.message);
        } else {
          showSuccess();
        }
        window.history.replaceState({}, "", "/profile");
      });
      return;
    }

    showSuccess();
    window.history.replaceState({}, "", "/profile");
  }, [apiActive, searchParams, showToast, updateUser]);

  return null;
}
