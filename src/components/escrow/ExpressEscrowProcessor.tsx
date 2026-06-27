"use client";

import { useEffect } from "react";
import { useVauto } from "@/context/VautoContext";
import {
  confirmTransaction,
  shouldAutoConfirmExpress,
} from "@/lib/order-agent";
import {
  applyWardrobeNegotiationTwinFee,
  buildWardrobeEscrowContext,
  finalizeWardrobeEscrowOnClose,
} from "@/lib/monetization-wardrobe";
import { apiProcessExpressEscrow } from "@/lib/api/client";
import { isAiProxyAvailable } from "@/lib/api/config";

/** Fone tikrina 24h express escrow ir automatiškai confirmTransaction(). */
export function ExpressEscrowProcessor() {
  const { chats, listings, chameleonTheme, updateEscrow, showToast } = useVauto();

  useEffect(() => {
    const tick = () => {
      for (const chat of chats) {
        const escrow = chat.escrow;
        if (!escrow || !shouldAutoConfirmExpress(escrow)) continue;

        const listing = listings.find((l) => l.id === chat.listingId);
        const ctx = buildWardrobeEscrowContext(chameleonTheme, chat, listing);

        const finish = (raw: typeof escrow) => {
          let next = confirmTransaction(raw);
          next = applyWardrobeNegotiationTwinFee(next, ctx);
          next = finalizeWardrobeEscrowOnClose(next, ctx);
          updateEscrow(chat.id, next);
          showToast(
            `Express escrow: pinigai pervesti pardavėjui (${chat.listingTitle}).`,
            "success"
          );
        };

        if (isAiProxyAvailable()) {
          void apiProcessExpressEscrow({ escrow }).then((res) => {
            if (res?.autoConfirmed) finish(res.escrow);
          });
        } else {
          finish(confirmTransaction(escrow));
        }
      }
    };

    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [chats, listings, chameleonTheme, updateEscrow, showToast]);

  return null;
}
