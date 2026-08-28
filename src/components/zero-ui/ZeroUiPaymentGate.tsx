"use client";

import { CreditCard, Sparkles, Wallet, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useVauto } from "@/context/VautoContext";
import {
  SMART_BOOST_B2B,
  normalizeMicroPaymentIntent,
  type ZeroUiMicroPaymentIntent,
} from "@/lib/monetization-engine";

type GateStep = "confirm" | "paying" | "success";

interface ZeroUiPaymentGateProps {
  intent: ZeroUiMicroPaymentIntent;
  onSuccess: () => void;
  onCancel: () => void;
  embedded?: boolean;
}

function productTitle(product: ZeroUiMicroPaymentIntent["product"]): string {
  if (product === "region_stats") return "Regiono paklausos statistika";
  if (product === "b2b_lead") return "Tikslinis klientas (Lead Gen)";
  if (product === "smart_boost") return "Smart Boost";
  return "Mikro-mokėjimas";
}

export function ZeroUiPaymentGate({
  intent,
  onSuccess,
  onCancel,
  embedded = false,
}: ZeroUiPaymentGateProps) {
  const { user, updateUser, showToast, promoteListing } = useVauto();
  const [step, setStep] = useState<GateStep>("confirm");
  const resolvedIntent = normalizeMicroPaymentIntent(intent, user);
  const walletBalance = user.walletBalance ?? 0;
  const canUseWallet = walletBalance >= resolvedIntent.price;
  const confirmLabel = resolvedIntent.voiceConfirmPhrase ?? "Taip, apmokėti";
  const isSmartBoost = resolvedIntent.product === "smart_boost";
  const isB2bBoost = isSmartBoost && resolvedIntent.price === SMART_BOOST_B2B;

  const completePayment = useCallback(() => {
    setStep("paying");
    window.setTimeout(() => {
      const balance = user.walletBalance ?? 0;
      const listingId =
        resolvedIntent.metadata?.listingId ?? intent.metadata?.listingId;
      if (isSmartBoost && listingId) {
        promoteListing(listingId, resolvedIntent.price, isB2bBoost ? 3 : 2);
      }
      if (canUseWallet) {
        updateUser({ walletBalance: balance - resolvedIntent.price });
      }
      setStep("success");
      showToast(`${productTitle(resolvedIntent.product)} aktyvuotas`, "success");
      window.setTimeout(() => {
        onSuccess();
      }, 1200);
    }, 900);
  }, [
    canUseWallet,
    intent.metadata?.listingId,
    isB2bBoost,
    isSmartBoost,
    promoteListing,
    resolvedIntent.metadata?.listingId,
    resolvedIntent.price,
    resolvedIntent.product,
    onSuccess,
    showToast,
    updateUser,
    user.walletBalance,
  ]);

  const shellClass = embedded
    ? "rounded-2xl border border-[var(--ds-brand)]/30 bg-gradient-to-br from-[var(--ds-brand-soft)] to-[var(--ds-surface-card)] p-5 shadow-sm"
    : "fixed inset-0 z-[260] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center";

  const cardClass = embedded
    ? "w-full"
    : "w-full max-w-md rounded-3xl bg-[var(--ds-surface-card)] p-6 shadow-2xl";

  return (
    <div className={shellClass} role="dialog" aria-label="Mokėjimo patvirtinimas">
      <div className={cardClass}>
        {step === "confirm" && (
          <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[var(--vauto-teal)]" />
                <h3 className="font-display text-lg font-bold text-[var(--ds-text-primary)]">
                  {productTitle(resolvedIntent.product)}
                </h3>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-full p-1 text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-muted)]"
                aria-label="Uždaryti"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm leading-relaxed text-[var(--ds-text-primary)]">{resolvedIntent.reason}</p>

            <div className="mt-4 rounded-xl border border-[var(--ds-ai)]/25 bg-[var(--ds-ai-soft)] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-[var(--vauto-text-muted)]">Suma</p>
              <p className="font-display text-2xl font-bold text-[var(--ds-ai)]">
                {resolvedIntent.price.toFixed(2)} €
              </p>
              {isSmartBoost && (
                <p className="mt-1 text-xs text-[var(--vauto-text-muted)]">
                  {isB2bBoost
                    ? "Verslo Smart Boost — apgalvotas matomumas, apsauga nuo dirbtinės konkurencijos (7 d.)"
                    : "Padidina skelbimo matomumą 7 dienoms"}
                </p>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-[var(--vauto-text-muted)]">
              <Wallet className="h-4 w-4" />
              Piniginė: {walletBalance.toFixed(2)} €
              {!canUseWallet && " — demo režime mokėjimas vis tiek leidžiamas"}
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={completePayment}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ds-brand)] px-4 py-3 text-sm font-semibold text-[var(--ds-brand-contrast)] hover:bg-[var(--ds-brand-hover)]"
              >
                <CreditCard className="h-4 w-4" />
                {confirmLabel}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="py-2 text-sm text-[var(--vauto-text-muted)] hover:text-[var(--vauto-text-heading)]"
              >
                Atšaukti
              </button>
            </div>
          </>
        )}

        {step === "paying" && (
          <div className="py-10 text-center">
            <Sparkles className="mx-auto h-8 w-8 animate-pulse text-[var(--ds-brand)]" />
            <p className="mt-3 text-sm font-medium text-[var(--vauto-body)]">Apdorojamas mokėjimas…</p>
          </div>
        )}

        {step === "success" && (
          <div className="py-10 text-center">
            <p className="font-display text-lg font-bold text-emerald-600">Mokėjimas patvirtintas</p>
            <p className="mt-2 text-sm text-[var(--ds-text-secondary)]">{productTitle(resolvedIntent.product)} aktyvuotas</p>
          </div>
        )}
      </div>
    </div>
  );
}
