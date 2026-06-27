"use client";

import { useEffect } from "react";
import { useVauto } from "@/context/VautoContext";
import {
  confirmTransaction,
  shouldAutoConfirmExpress,
} from "@/lib/order-agent";
import { apiProcessExpressEscrow } from "@/lib/api/client";
import { isAiProxyAvailable } from "@/lib/api/config";

/** Fone tikrina 24h express escrow ir automatiškai confirmTransaction(). */
export function ExpressEscrowProcessor() {
  const { chats, updateEscrow, showToast } = useVauto();

  useEffect(() => {
    const tick = () => {
      for (const chat of chats) {
        const escrow = chat.escrow;
        if (!escrow || !shouldAutoConfirmExpress(escrow)) continue;

        const finish = (next: typeof escrow) => {
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
  }, [chats, updateEscrow, showToast]);

  return null;
}
