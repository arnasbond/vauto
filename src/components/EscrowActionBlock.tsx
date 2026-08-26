"use client";

import { CheckCircle2, Clock, PackageCheck, ShieldCheck, Truck } from "lucide-react";
import { useState } from "react";
import { EscrowModal } from "@/components/EscrowModal";
import { useVauto } from "@/context/VautoContext";
import { useChat } from "@/context/ChatContext";
import { formatExpressDeadline } from "@/lib/order-agent";
import { resolveSellerDisplayName } from "@/lib/user-trust-score";
import { buildOmnivaShippingChatMessage } from "@/lib/shipping/omniva-seller-notify";
import type { ChatThread } from "@/lib/types";
import type { ParcelSize } from "@/lib/shipping/shipping-provider";

export function EscrowActionBlock({
  chat,
  amount,
}: {
  chat: ChatThread;
  amount: number;
}) {
  const { updateEscrow, listings, showToast } = useVauto();
  const { postSystemChatMessage } = useChat();
  const [open, setOpen] = useState(false);
  const escrow = chat.escrow;
  const sellerName = resolveSellerDisplayName(chat.sellerId, listings);

  if (escrow?.status === "completed") {
    return (
      <div className="mx-2 my-3 flex items-center gap-2 rounded-2xl border border-[var(--ds-success)]/30 bg-[var(--ds-success-soft)] p-4">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--ds-success)]" />
        <div>
          <p className="text-sm font-medium text-[var(--ds-text-primary)]">
            Escrow sandoris užbaigtas
          </p>
          {escrow.trackingCode && (
            <p className="font-mono text-xs text-[var(--ds-text-secondary)]">
              {escrow.trackingCode}
            </p>
          )}
        </div>
      </div>
    );
  }

  const inProgress =
    escrow &&
    ["paying", "paid", "label_sent", "shipped", "delivered"].includes(escrow.status);

  const statusLabel =
    escrow?.status === "paying"
      ? "Mokėjimas vyksta"
      : escrow?.status === "paid"
        ? "Apmokėta — rinkitės siuntimą"
        : escrow?.status === "label_sent"
          ? "Siuntos lipdukas paruoštas"
          : escrow?.status === "shipped"
            ? "Siunta išsiųsta"
            : escrow?.status === "delivered"
              ? "Siunta pristatyta"
              : "Sandorio eiga";

  return (
    <>
      <div className="mx-2 my-3 rounded-2xl border border-[var(--ds-ai)]/25 bg-[var(--ds-ai-soft)] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ds-surface-card)] text-[var(--ds-ai)] shadow-sm">
            {escrow?.status === "label_sent" || escrow?.status === "shipped" ? (
              <Truck className="h-5 w-5" />
            ) : escrow?.status === "delivered" ? (
              <PackageCheck className="h-5 w-5" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--ds-ai)]">
              {statusLabel}
            </p>
            <p className="mt-1 text-sm text-[var(--vauto-body)]">
              {inProgress ? (
                <>
                  Mokėjimo / siuntos procesas vyksta.{" "}
                  <button
                    type="button"
                    className="font-semibold text-[var(--ds-brand)] underline underline-offset-2"
                    onClick={() => setOpen(true)}
                  >
                    Atidaryti būseną
                  </button>
                </>
              ) : (
                <>
                  Atrodo, kad susitarėte dėl sandorio.{" "}
                  <button
                    type="button"
                    className="font-semibold text-[var(--ds-brand)] underline underline-offset-2"
                    onClick={() => setOpen(true)}
                  >
                    Pirkti saugiai — escrow + {amount.toFixed(2)} € + 5% apsauga
                  </button>
                </>
              )}
            </p>
            {escrow?.trackingCode && (
              <p className="mt-2 font-mono text-xs text-[var(--ds-ai)]">
                {escrow.trackingCode}
              </p>
            )}
            {escrow?.expressEscrow24h && escrow.status === "delivered" && (
              <p className="mt-2 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                <Clock className="h-3.5 w-3.5" />
                24h pasimatavimas iki {formatExpressDeadline(escrow)}
              </p>
            )}
          </div>
        </div>
      </div>
      {open && (
        <EscrowModal
          chat={chat}
          amount={amount}
          escrow={escrow}
          sellerName={sellerName}
          onClose={() => setOpen(false)}
          onUpdate={(e) => updateEscrow(chat.id, e)}
          onSellerNotify={(msg, meta) => {
            showToast(msg.slice(0, 120), "success");
            if (meta?.trackingCode) {
              postSystemChatMessage(
                chat.id,
                buildOmnivaShippingChatMessage({
                  trackingCode: meta.trackingCode,
                  qrPayload: meta.qrPayload,
                  trackingUrl: meta.trackingUrl,
                  lockerName: meta.lockerName,
                  parcelSize: (meta.parcelSize as ParcelSize) || "M",
                  listingTitle: chat.listingTitle,
                  mode: meta.mode === "simulated" ? "simulated" : "live",
                })
              );
            } else if (msg.trim()) {
              postSystemChatMessage(chat.id, {
                id: `m-sys-${Date.now()}`,
                senderId: "vauto-system",
                text: msg,
                timestamp: new Date().toISOString(),
              });
            }
          }}
        />
      )}
    </>
  );
}
