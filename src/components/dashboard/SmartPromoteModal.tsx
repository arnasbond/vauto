"use client";

import { useState } from "react";
import { Check, CreditCard, Sparkles, Wallet, X } from "lucide-react";
import type { Listing } from "@/lib/types";
import type { PromoteSuggestion } from "@/lib/smart-promote";

type PayMethod = "wallet" | "card";
type Step = "confirm" | "paying" | "success";

interface SmartPromoteModalProps {
  open: boolean;
  listing: Listing;
  suggestion: PromoteSuggestion;
  walletBalance: number;
  onClose: () => void;
  onConfirm: () => boolean;
}

export function SmartPromoteModal({
  open,
  listing,
  suggestion,
  walletBalance,
  onClose,
  onConfirm,
}: SmartPromoteModalProps) {
  const [method, setMethod] = useState<PayMethod>("wallet");
  const [step, setStep] = useState<Step>("confirm");
  const canUseWallet = walletBalance >= suggestion.cost;

  if (!open) return null;

  const handlePay = () => {
    if (method === "wallet" && !canUseWallet) return;
    setStep("paying");
    setTimeout(() => {
      const ok = onConfirm();
      setStep(ok ? "success" : "confirm");
      if (ok) setTimeout(onClose, 2000);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center">
      <div className="vauto-auth-modal w-full max-w-md rounded-t-3xl p-6 sm:rounded-3xl">
        {step === "confirm" && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[var(--vauto-teal)]" />
                <h3 className="font-semibold text-white">Smart Promote</h3>
              </div>
              <button type="button" onClick={onClose} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-1 text-sm text-slate-300">{listing.title}</p>
            <p className="mb-4 text-xs leading-relaxed text-teal-200/80">
              {suggestion.message} · {suggestion.durationDays} d.
            </p>
            <p className="mb-4 text-3xl font-bold text-white">
              {suggestion.cost.toFixed(2)} €
            </p>
            <div className="mb-4 space-y-2">
              <button
                type="button"
                onClick={() => setMethod("wallet")}
                disabled={!canUseWallet}
                className={`flex w-full items-center gap-3 rounded-xl p-3 text-left ${
                  method === "wallet"
                    ? "bg-[var(--vauto-teal)]/20 ring-1 ring-[var(--vauto-teal)]"
                    : "bg-white/5"
                } ${!canUseWallet ? "opacity-50" : ""}`}
              >
                <Wallet className="h-5 w-5 text-[var(--vauto-teal)]" />
                <div>
                  <p className="text-sm font-medium text-white">Vauto Wallet</p>
                  <p className="text-xs text-slate-400">
                    Likutis: {walletBalance.toFixed(2)} €
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMethod("card")}
                className={`flex w-full items-center gap-3 rounded-xl p-3 text-left ${
                  method === "card"
                    ? "bg-[var(--vauto-teal)]/20 ring-1 ring-[var(--vauto-teal)]"
                    : "bg-white/5"
                }`}
              >
                <CreditCard className="h-5 w-5 text-slate-300" />
                <div>
                  <p className="text-sm font-medium text-white">Išsaugota kortelė</p>
                  <p className="text-xs text-slate-400">•••• 4242</p>
                </div>
              </button>
            </div>
            <button
              type="button"
              onClick={handlePay}
              disabled={method === "wallet" && !canUseWallet}
              className="w-full rounded-2xl bg-[var(--vauto-orange)] py-3.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Apmokėti ir aktyvuoti
            </button>
          </>
        )}
        {step === "paying" && (
          <div className="py-10 text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[var(--vauto-teal)]/20 border-t-[var(--vauto-teal)]" />
            <p className="text-sm text-white">Apdorojamas mokėjimas…</p>
          </div>
        )}
        {step === "success" && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
              <Check className="h-8 w-8 text-emerald-400" />
            </div>
            <p className="font-semibold text-white">Skelbimas išskirtas!</p>
            <p className="mt-1 text-sm text-slate-400">
              Smart Promote aktyvuotas {suggestion.durationDays} dienoms
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
