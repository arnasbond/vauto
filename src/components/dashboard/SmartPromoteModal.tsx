"use client";

import { useEffect, useState } from "react";
import { Sparkles, Star, TrendingUp, X } from "lucide-react";
import {
  B2C_PROMOTE_PRODUCTS,
  buildB2CPromoteCheckout,
  type B2CPromoteProductId,
  type CheckoutSession,
} from "@/lib/monetization-catalog";
import type { Listing } from "@/lib/types";
import { categoryToTheme, getChameleonTheme } from "@/lib/chameleon-themes";
import { cn } from "@/lib/cn";

const PRODUCT_ICONS: Record<B2CPromoteProductId, typeof Sparkles> = {
  refresh: TrendingUp,
  plus: Star,
  top: Sparkles,
};

interface SmartPromoteModalProps {
  open: boolean;
  listing: Listing;
  onClose: () => void;
  onOpenCheckout: (session: CheckoutSession) => void;
}

export function SmartPromoteModal({
  open,
  listing,
  onClose,
  onOpenCheckout,
}: SmartPromoteModalProps) {
  const [selected, setSelected] = useState<B2CPromoteProductId>("plus");

  useEffect(() => {
    if (open) setSelected("plus");
  }, [open, listing.id]);

  if (!open) return null;

  const theme = getChameleonTheme(categoryToTheme(listing.category));
  const classic = theme.classicLayout;
  const selectedProduct = B2C_PROMOTE_PRODUCTS.find((p) => p.id === selected)!;

  const modalSurface = classic
    ? "bg-white border border-[#d0d7de] text-[#1f2937] shadow-xl"
    : "vauto-auth-modal border border-[var(--vauto-border)]";

  const titleColor = classic ? "text-[#1f2937]" : "text-[var(--vauto-text)]";
  const mutedColor = classic ? "text-[#6b7280]" : "text-[var(--vauto-text-muted)]";

  const handleContinue = () => {
    onOpenCheckout(buildB2CPromoteCheckout(listing.id, listing.title, selected));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center">
      <div
        className={cn(
          "max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl p-6 sm:rounded-3xl transition-colors duration-300",
          modalSurface
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--vauto-teal)]" />
            <h3 className={cn("font-semibold", titleColor)}>Iškelti skelbimą</h3>
          </div>
          <button type="button" onClick={onClose} className={mutedColor} aria-label="Uždaryti">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className={cn("mb-1 text-sm font-medium", titleColor)}>{listing.title}</p>
        <p className={cn("mb-4 text-xs", mutedColor)}>
          Pasirinkite matomumo paketą — apmokėjimas per saugų VAUTO Checkout.
        </p>

        <div className="mb-5 space-y-2">
          {B2C_PROMOTE_PRODUCTS.map((product) => {
            const Icon = PRODUCT_ICONS[product.id];
            const isSelected = selected === product.id;
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => setSelected(product.id)}
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition",
                  isSelected
                    ? classic
                      ? "border-[#1565c0] bg-[#e8f0fe] ring-1 ring-[#1565c0]"
                      : "border-[var(--vauto-teal)] bg-[var(--vauto-teal)]/15 ring-1 ring-[var(--vauto-teal)]"
                    : classic
                      ? "border-[#e5e7eb] bg-[#f9fafb] hover:bg-[#f3f4f6]"
                      : "border-[var(--vauto-border)] bg-[var(--vauto-bg)]/40 hover:border-[var(--vauto-teal)]/30"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex gap-2">
                    <Icon
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        isSelected ? "text-[var(--vauto-teal)]" : mutedColor
                      )}
                    />
                    <div>
                      <span className={cn("text-sm font-semibold", titleColor)}>
                        {product.title}
                      </span>
                      <p className={cn("mt-0.5 text-[11px] leading-snug", mutedColor)}>
                        {product.description}
                      </p>
                      {product.durationDays && (
                        <p className="mt-1 text-[10px] text-[var(--vauto-teal)]">
                          Galioja {product.durationDays} d.
                        </p>
                      )}
                    </div>
                  </div>
                  <p className={cn("shrink-0 text-sm font-bold", titleColor)}>
                    {product.priceEur.toFixed(2)} €
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <p className={cn("mb-4 text-center text-3xl font-bold", titleColor)}>
          {selectedProduct.priceEur.toFixed(2)} €
        </p>

        <button
          type="button"
          onClick={handleContinue}
          className="w-full min-h-[52px] rounded-2xl bg-[var(--vauto-teal)] py-3.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Tęsti į apmokėjimą — {selectedProduct.title}
        </button>
      </div>
    </div>
  );
}
