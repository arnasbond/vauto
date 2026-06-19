"use client";

import { useState } from "react";
import { Check, CreditCard, Sparkles, Wallet, X } from "lucide-react";
import type { Listing } from "@/lib/types";
import type { PromoteSuggestion } from "@/lib/smart-promote";
import { categoryToTheme, getChameleonTheme } from "@/lib/chameleon-themes";
import { cn } from "@/lib/cn";

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
  const theme = getChameleonTheme(categoryToTheme(listing.category));
  const labels = suggestion.labels;
  const classic = theme.classicLayout;

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

  const modalSurface = classic
    ? "bg-white border border-[#d0d7de] text-[#1f2937] shadow-xl"
    : "vauto-auth-modal";

  const titleColor = classic
    ? chameleonTitleColor(theme.id)
    : "text-white";

  return (
    <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center">
      <div className={cn("w-full max-w-md rounded-t-3xl p-6 sm:rounded-3xl transition-colors duration-300", modalSurface)}>
        {step === "confirm" && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles
                  className={cn(
                    "h-5 w-5",
                    theme.id === "autoplius" && "text-[#1a56db]",
                    theme.id === "vinted" && "text-[#09b1a8]",
                theme.id === "skelbiu" && "text-[#1565c0]",
                theme.id === "aruodas" && "text-[#c62828]",
                theme.id === "flux" && "text-[var(--vauto-teal)]"
                  )}
                />
                <h3 className={cn("font-semibold", titleColor)}>{labels.modalTitle}</h3>
              </div>
              <button type="button" onClick={onClose} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className={cn("mb-1 text-sm", classic ? "text-[#374151]" : "text-slate-300")}>
              {listing.title}
            </p>
            <p
              className={cn(
                "mb-4 text-xs leading-relaxed",
                classic ? "text-[#6b7280]" : "text-teal-200/80"
              )}
            >
              {suggestion.message} · {labels.bumpLabel} · {suggestion.durationDays} d.
            </p>
            <p className={cn("mb-4 text-3xl font-bold", titleColor)}>
              {suggestion.cost.toFixed(2)} €
            </p>
            <div className="mb-4 space-y-2">
              <button
                type="button"
                onClick={() => setMethod("wallet")}
                disabled={!canUseWallet}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl p-3 text-left transition",
                  method === "wallet"
                    ? classic
                      ? "bg-[#e8f0fe] ring-1 ring-[#1a56db]"
                      : "bg-[var(--vauto-teal)]/20 ring-1 ring-[var(--vauto-teal)]"
                    : classic
                      ? "bg-[#f9fafb] border border-[#e5e7eb]"
                      : "bg-white/5",
                  !canUseWallet && "opacity-50"
                )}
              >
                <Wallet className="h-5 w-5 text-[var(--vauto-teal)]" />
                <div>
                  <p className={cn("text-sm font-medium", titleColor)}>Vauto Wallet</p>
                  <p className={cn("text-xs", classic ? "text-[#6b7280]" : "text-slate-400")}>
                    Likutis: {walletBalance.toFixed(2)} €
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMethod("card")}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl p-3 text-left transition",
                  method === "card"
                    ? classic
                      ? "bg-[#e8f0fe] ring-1 ring-[#1a56db]"
                      : "bg-[var(--vauto-teal)]/20 ring-1 ring-[var(--vauto-teal)]"
                    : classic
                      ? "bg-[#f9fafb] border border-[#e5e7eb]"
                      : "bg-white/5"
                )}
              >
                <CreditCard className="h-5 w-5 text-slate-300" />
                <div>
                  <p className={cn("text-sm font-medium", titleColor)}>Išsaugota kortelė</p>
                  <p className={cn("text-xs", classic ? "text-[#6b7280]" : "text-slate-400")}>
                    •••• 4242
                  </p>
                </div>
              </button>
            </div>
            <button
              type="button"
              onClick={handlePay}
              disabled={method === "wallet" && !canUseWallet}
              className={cn(
                "w-full min-h-[52px] rounded-2xl py-3.5 text-sm font-semibold text-white disabled:opacity-50 transition",
                theme.id === "autoplius" && "bg-[#ea580c] hover:bg-[#c2410c]",
                theme.id === "vinted" && "bg-[#09b1a8] hover:bg-[#078f88]",
                theme.id === "skelbiu" && "bg-[#1565c0] text-lg font-bold hover:bg-[#0d47a1]",
                theme.id === "aruodas" && "bg-[#c62828] text-lg font-bold hover:bg-[#b71c1c] rounded-md",
                theme.id === "flux" && "bg-[var(--vauto-orange)]"
              )}
            >
              Apmokėti — {labels.bumpLabel}
            </button>
          </>
        )}
        {step === "paying" && (
          <div className="py-10 text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[var(--vauto-teal)]/20 border-t-[var(--vauto-teal)]" />
            <p className={cn("text-sm", titleColor)}>Apdorojamas mokėjimas…</p>
          </div>
        )}
        {step === "success" && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
              <Check className="h-8 w-8 text-emerald-400" />
            </div>
            <p className={cn("font-semibold", titleColor)}>{labels.successMessage}</p>
            <p className={cn("mt-1 text-sm", classic ? "text-[#6b7280]" : "text-slate-400")}>
              {labels.bumpLabel} · {suggestion.durationDays} dienos
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function chameleonTitleColor(
  id: ReturnType<typeof categoryToTheme>
): string {
  switch (id) {
    case "autoplius":
      return "text-[#1f2937]";
    case "vinted":
      return "text-[#374151] font-light";
    case "skelbiu":
      return "text-[#263238] font-bold";
    case "aruodas":
      return "text-[#212121] font-bold";
    default:
      return "text-white";
  }
}
