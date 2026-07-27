"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { apiConfirmEscrowSession } from "@/lib/api/client";

/** Confirms Stripe escrow Checkout return on /pokalbiai/?escrow=success&session_id=… */
export function EscrowReturnToast() {
  const searchParams = useSearchParams();
  const { showToast, user, apiActive } = useVauto();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;

    const escrow = searchParams.get("escrow");
    if (!escrow) return;

    handledRef.current = true;
    const sessionId = searchParams.get("session_id");
    const thread =
      searchParams.get("id") ?? searchParams.get("thread");

    const clearQuery = () => {
      const next = thread
        ? `/pokalbiai/?id=${encodeURIComponent(thread)}`
        : "/pokalbiai/";
      window.history.replaceState({}, "", next);
    };

    if (escrow === "cancel") {
      showToast("Saugaus pirkimo mokėjimas atšauktas", "info");
      clearQuery();
      return;
    }

    if (escrow !== "success") return;

    if (apiActive && sessionId && user?.id) {
      void apiConfirmEscrowSession(sessionId, user.id).then((r) => {
        if (r.ok) {
          showToast(
            "Mokėjimas gautas — saugus pirkimas aktyvuotas. Galite sekti būseną pokalbyje.",
            "success"
          );
        } else {
          showToast(
            "Mokėjimas gautas. Jei būsena dar nesikeitė — atnaujinkite pokalbį po kelių sekundžių.",
            "success"
          );
        }
        clearQuery();
      });
      return;
    }

    showToast("Mokėjimas gautas — saugus pirkimas aktyvuotas.", "success");
    clearQuery();
  }, [apiActive, searchParams, showToast, user?.id]);

  return null;
}
