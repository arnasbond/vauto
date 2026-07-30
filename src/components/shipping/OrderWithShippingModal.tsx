"use client";

import { useMemo, useState } from "react";
import { Loader2, Package, Truck, X } from "lucide-react";
import { ParcelLockerPicker } from "@/components/escrow/ParcelLockerPicker";
import { useVauto } from "@/context/VautoContext";
import { useChat } from "@/context/ChatContext";
import { apiEscrowShippingLabel, apiUpsertEscrow } from "@/lib/api/client";
import { isDataApiEnabled } from "@/lib/api/config";
import { createEscrow, patchEscrow } from "@/lib/escrow";
import { chatThreadPath } from "@/lib/chat-routes";
import { trackListingEvent } from "@/lib/listing-events";
import {
  formatOmnivaParcelPrice,
  OMNIVA_PARCEL_SIZE_HINTS,
  omnivaParcelPriceEur,
  resolveDefaultParcelSize,
} from "@/lib/shipping/omniva-parcel-prices";
import { buildOmnivaShippingChatMessage } from "@/lib/shipping/omniva-seller-notify";
import type { ParcelSize } from "@/lib/shipping/shipping-provider";
import type { ParcelLocker } from "@/lib/shipping/shipping-routing";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useRouter } from "next/navigation";

const SIZES: ParcelSize[] = ["S", "M", "L"];

interface OrderWithShippingModalProps {
  listing: Listing;
  onClose: () => void;
}

export function OrderWithShippingModal({
  listing,
  onClose,
}: OrderWithShippingModalProps) {
  const router = useRouter();
  const { showToast, user, isAuthenticated, openAuthModal } = useVauto();
  const { startChat, updateEscrow, postSystemChatMessage, setEscrowOffered } =
    useChat();
  const defaultSize = resolveDefaultParcelSize(
    String(listing.attributes?.estimatedSize ?? "")
  );
  const [parcelSize, setParcelSize] = useState<ParcelSize>(defaultSize);
  const [locker, setLocker] = useState<ParcelLocker | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const shipFee = useMemo(() => omnivaParcelPriceEur(parcelSize), [parcelSize]);
  const total = useMemo(
    () => Math.round((listing.price + shipFee) * 100) / 100,
    [listing.price, shipFee]
  );

  const handleSubmit = async () => {
    if (!isAuthenticated) {
      openAuthModal();
      return;
    }
    if (!locker) {
      showToast("Pasirinkite Omniva paštomatą.", "info");
      return;
    }
    setSubmitting(true);
    try {
      const chatId = startChat(listing.id);
      if (!chatId) {
        showToast("Nepavyko atidaryti pokalbio.", "error");
        return;
      }

      setEscrowOffered(chatId, true);

      const threadStub = {
        id: chatId,
        listingId: listing.id,
        listingTitle: listing.title,
        buyerId: user.id,
        sellerId: listing.sellerId,
        messages: [],
        escrowOffered: true,
      };
      let escrow = createEscrow(threadStub, listing.price);
      escrow = patchEscrow(escrow, {
        status: "paid",
        shippingProvider: "omniva",
        shippingLockerId: locker.id,
        shippingLockerName: locker.name,
        deliveryStatus: "awaiting_shipment",
        buyerTotal: total,
      });
      updateEscrow(chatId, escrow);

      if (isDataApiEnabled()) {
        await apiUpsertEscrow(escrow);
        const res = await apiEscrowShippingLabel({
          escrowId: escrow.id,
          providerId: "omniva",
          parcelSize,
          lockerId: locker.id,
          lockerName: locker.name,
          userId: user.id,
        });
        if (res.ok) {
          updateEscrow(chatId, res.data.escrow);
          const msg = buildOmnivaShippingChatMessage({
            trackingCode: res.data.label.trackingCode,
            qrPayload: res.data.label.qrPayload,
            trackingUrl: res.data.label.trackingUrl,
            lockerName: locker.name,
            parcelSize,
            listingTitle: listing.title,
            mode: res.data.label.mode === "live" ? "live" : "simulated",
          });
          postSystemChatMessage(chatId, msg);
          trackListingEvent("contact", {
            listingId: listing.id,
            channel: "omniva_order",
            parcelSize,
            trackingCode: res.data.label.trackingCode,
          });
          showToast("Užsakymas pateiktas — Omniva kodas išsiųstas pardavėjui.", "success");
          onClose();
          router.push(chatThreadPath(chatId));
          return;
        }
        showToast(res.error || "Nepavyko gauti Omniva lipduko.", "error");
      } else {
        showToast("Reikia live API (Omniva) — patikrinkite NEXT_PUBLIC_API_URL.", "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div
        className="flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] shadow-2xl sm:rounded-3xl"
        role="dialog"
        aria-modal="true"
        aria-label="Užsakyti su siuntimu"
        data-order-with-shipping="1"
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--vauto-border-subtle)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-[var(--vauto-primary)]" aria-hidden />
            <h2 className="text-base font-bold text-[var(--vauto-ink)]">
              Užsakyti su siuntimu
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-full p-2 text-[var(--vauto-muted)] hover:bg-[var(--vauto-surface-muted)]"
            aria-label="Uždaryti"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <p className="text-sm text-[var(--vauto-muted)]">
            Omniva paštomatas visoje Lietuvoje. Pasirinkite dydį ir paštomatą —
            pardavėjas čate gaus siuntos kodą / QR.
          </p>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--vauto-subtle)]">
              Pakuotės dydis
            </p>
            <div className="grid grid-cols-3 gap-2">
              {SIZES.map((size) => {
                const active = parcelSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    disabled={submitting}
                    onClick={() => setParcelSize(size)}
                    className={cn(
                      "rounded-xl border px-2 py-2.5 text-left transition",
                      active
                        ? "border-[var(--vauto-primary)] bg-[var(--vauto-primary)]/10 ring-1 ring-[var(--vauto-primary)]/30"
                        : "border-[var(--vauto-border)] bg-[var(--vauto-surface)]"
                    )}
                  >
                    <span className="flex items-center gap-1 text-sm font-bold text-[var(--vauto-ink)]">
                      <Package className="h-3.5 w-3.5" aria-hidden />
                      {size}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-[var(--vauto-muted)]">
                      {OMNIVA_PARCEL_SIZE_HINTS[size]}
                    </span>
                    <span className="mt-1 block text-xs font-semibold text-[var(--vauto-primary)]">
                      {formatOmnivaParcelPrice(size)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--vauto-subtle)]">
              Omniva paštomatas
            </p>
            <ParcelLockerPicker
              providerId="omniva"
              selectedId={locker?.id}
              originLocation={listing.location}
              onSelect={setLocker}
            />
          </div>

          <div className="rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-surface-muted)]/40 px-3 py-2.5 text-sm">
            <div className="flex justify-between text-[var(--vauto-muted)]">
              <span>Prekė</span>
              <span>{listing.price.toFixed(2)} €</span>
            </div>
            <div className="mt-1 flex justify-between text-[var(--vauto-muted)]">
              <span>Omniva ({parcelSize})</span>
              <span>{shipFee.toFixed(2)} €</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-[var(--vauto-border)] pt-2 font-bold text-[var(--vauto-ink)]">
              <span>Viso</span>
              <span>{total.toFixed(2)} €</span>
            </div>
          </div>
        </div>

        <footer className="shrink-0 border-t border-[var(--vauto-border-subtle)] px-4 py-3">
          <button
            type="button"
            disabled={submitting || !locker}
            onClick={() => void handleSubmit()}
            className="flex w-full min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--vauto-primary)] text-sm font-bold text-[var(--vauto-primary-contrast)] disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Truck className="h-4 w-4" aria-hidden />
            )}
            Pateikti užsakymą
          </button>
        </footer>
      </div>
    </div>
  );
}
