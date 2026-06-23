"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useVauto } from "@/context/VautoContext";

export function BillingReturnToast() {
  const searchParams = useSearchParams();
  const { showToast } = useVauto();

  useEffect(() => {
    const billing = searchParams.get("billing");
    if (!billing) return;

    if (billing === "success") {
      const plan = searchParams.get("plan");
      showToast(
        plan === "pro"
          ? "Pro planas aktyvuotas! Ačiū už prenumeratą."
          : "Starto planas aktyvuotas! Ačiū už prenumeratą.",
        "success"
      );
    } else if (billing === "cancel") {
      showToast("Mokėjimas atšauktas", "info");
    }

    window.history.replaceState({}, "", "/profile");
  }, [searchParams, showToast]);

  return null;
}
