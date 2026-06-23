"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CreditCard,
  Lock,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { formatPrice } from "@/data/mockListings";
import type { Listing } from "@/lib/types";
import type { PromoteSuggestion } from "@/lib/smart-promote";
import { resolveSelectedPlan } from "@/lib/smart-promote";
import { precisionLabel } from "@/lib/market-insights";
import { VISIBILITY_POLICY_SUMMARY } from "@/lib/visibility-plans";
import type { VisibilityTierId } from "@/lib/visibility-plans";
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
  onConfirm: (tierId: VisibilityTierId, cost: number) => boolean;
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
  const [selectedTierId, setSelectedTierId] = useState<VisibilityTierId>(
    suggestion.selectedTierId ?? suggestion.recommendedTierId
  );

  useEffect(() => {
    if (open) {
      setStep("confirm");
      setSelectedTierId(suggestion.selectedTierId ?? suggestion.recommendedTierId);
    }
  }, [open, suggestion.selectedTierId, suggestion.recommendedTierId]);

  const selectedPlan = useMemo(() => {
    const plan = suggestion.plans.find((p) => p.id === selectedTierId);
    return plan ?? resolveSelectedPlan(suggestion);
  }, [selectedTierId, suggestion]);

  const canUseWallet = walletBalance >= selectedPlan.price;
  const theme = getChameleonTheme(categoryToTheme(listing.category));
  const classic = theme.classicLayout;
  const insights = suggestion.insights;
  const advice = insights?.priceAdvice;

  if (!open) return null;

  const handlePay = () => {
    if (!selectedPlan.available) return;
    if (method === "wallet" && !canUseWallet) return;
    setStep("paying");
    setTimeout(() => {
      const ok = onConfirm(selectedPlan.id, selectedPlan.price);
      setStep(ok ? "success" : "confirm");
      if (ok) setTimeout(onClose, 2000);
    }, 1500);
  };

  const modalSurface = classic
    ? "bg-white border border-[#d0d7de] text-[#1f2937] shadow-xl"
    : "vauto-auth-modal";

  const titleColor = classic ? chameleonTitleColor(theme.id) : "text-white";

  return (
    <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center">
      <div
        className={cn(
          "max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl p-6 sm:rounded-3xl transition-colors duration-300",
          modalSurface
        )}
      >
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
                <h3 className={cn("font-semibold", titleColor)}>
                  Matomumo planai
                </h3>
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
                "mb-3 text-xs leading-relaxed",
                classic ? "text-[#6b7280]" : "text-teal-200/80"
              )}
            >
              {suggestion.message}
            </p>

            <div
              className={cn(
                "mb-4 flex items-start gap-2 rounded-xl border p-3 text-[11px] leading-relaxed",
                classic
                  ? "border-[#d0d7de] bg-[#f8fafc] text-[#6b7280]"
                  : "border-white/10 bg-white/5 text-slate-400"
              )}
            >
              <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--vauto-teal)]" />
              <p>{VISIBILITY_POLICY_SUMMARY.join(" ")}</p>
            </div>

            <div className="mb-4 space-y-2">
              {suggestion.plans.map((plan) => {
                const isSelected = plan.id === selectedTierId;
                const disabled = !plan.available;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => !disabled && setSelectedTierId(plan.id)}
                    className={cn(
                      "w-full rounded-xl border p-3 text-left transition",
                      disabled && "cursor-not-allowed opacity-55",
                      isSelected && !disabled
                        ? classic
                          ? "border-[#1565c0] bg-[#e8f0fe] ring-1 ring-[#1565c0]"
                          : "border-[var(--vauto-teal)] bg-[var(--vauto-teal)]/15 ring-1 ring-[var(--vauto-teal)]"
                        : classic
                          ? "border-[#e5e7eb] bg-[#f9fafb] hover:bg-[#f3f4f6]"
                          : "border-white/10 bg-white/5 hover:bg-white/[0.07]"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              "text-sm font-semibold",
                              classic ? "text-[#1f2937]" : "text-white"
                            )}
                          >
                            {plan.label}
                          </span>
                          {plan.recommended && plan.available && (
                            <span className="rounded-full bg-[var(--vauto-orange)]/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--vauto-orange)]">
                              Rekomenduojama
                            </span>
                          )}
                          {plan.maxSlotsPerRegion !== "unlimited" && (
                            <span className="text-[9px] text-slate-500">
                              max {plan.maxSlotsPerRegion} vietos
                            </span>
                          )}
                        </div>
                        <p
                          className={cn(
                            "mt-0.5 text-[11px] leading-snug",
                            classic ? "text-[#6b7280]" : "text-slate-400"
                          )}
                        >
                          {plan.description}
                        </p>
                        <p
                          className={cn(
                            "mt-1 text-[10px]",
                            classic ? "text-[#1565c0]" : "text-[var(--vauto-teal)]"
                          )}
                        >
                          {plan.feedPosition} · {plan.expectedLift} · {plan.durationDays} d.
                        </p>
                        {disabled && plan.unavailableReason && (
                          <p className="mt-1 flex items-center gap-1 text-[10px] text-amber-500">
                            <Lock className="h-3 w-3" />
                            {plan.unavailableReason}
                          </p>
                        )}
                      </div>
                      <p
                        className={cn(
                          "shrink-0 text-sm font-bold",
                          classic ? "text-[#1f2937]" : "text-white"
                        )}
                      >
                        {plan.price.toFixed(2)} €
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {insights && suggestion.competitorCount > 0 && (
              <div
                className={cn(
                  "mb-4 rounded-xl border p-3",
                  classic
                    ? "border-[#d0d7de] bg-[#f8fafc]"
                    : "border-white/10 bg-white/5"
                )}
              >
                <p
                  className={cn(
                    "mb-2 text-[10px] font-semibold uppercase tracking-wide",
                    classic ? "text-[#6b7280]" : "text-slate-500"
                  )}
                >
                  Konkurentų statistika
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-sky-400" />
                    <span className={classic ? "text-[#374151]" : "text-slate-300"}>
                      {suggestion.competitorCount} panašūs skelbimai
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                    <span className={classic ? "text-[#374151]" : "text-slate-300"}>
                      {selectedPlan.expectedLift}
                    </span>
                  </div>
                </div>
                {advice?.minPrice != null && advice.maxPrice != null && (
                  <p
                    className={cn(
                      "mt-2 text-[11px]",
                      classic ? "text-[#1565c0]" : "text-[var(--vauto-teal)]"
                    )}
                  >
                    Rinkos kainos {insights.scopeLabel}:{" "}
                    {formatPrice(advice.minPrice)} – {formatPrice(advice.maxPrice)}
                  </p>
                )}
                <p
                  className={cn(
                    "mt-1 text-[10px]",
                    classic ? "text-[#6b7280]" : "text-slate-500"
                  )}
                >
                  {precisionLabel(insights.precision)}
                </p>
              </div>
            )}

            <p className={cn("mb-4 text-3xl font-bold", titleColor)}>
              {selectedPlan.price.toFixed(2)} €
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
              disabled={
                !selectedPlan.available || (method === "wallet" && !canUseWallet)
              }
              className={cn(
                "w-full min-h-[52px] rounded-2xl py-3.5 text-sm font-semibold text-white disabled:opacity-50 transition",
                theme.id === "autoplius" && "bg-[#ea580c] hover:bg-[#c2410c]",
                theme.id === "vinted" && "bg-[#09b1a8] hover:bg-[#078f88]",
                theme.id === "skelbiu" && "bg-[#1565c0] text-lg font-bold hover:bg-[#0d47a1]",
                theme.id === "aruodas" && "bg-[#c62828] text-lg font-bold hover:bg-[#b71c1c] rounded-md",
                theme.id === "flux" && "bg-[var(--vauto-orange)]"
              )}
            >
              {selectedPlan.available
                ? `Aktyvuoti „${selectedPlan.label}“ — ${selectedPlan.price.toFixed(2)} €`
                : "Planas nepasiekiamas"}
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
            <p className={cn("font-semibold", titleColor)}>
              „{selectedPlan.label}“ aktyvuota
            </p>
            <p className={cn("mt-1 text-sm", classic ? "text-[#6b7280]" : "text-slate-400")}>
              {selectedPlan.feedPosition} · {selectedPlan.durationDays} dienos
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function chameleonTitleColor(id: ReturnType<typeof categoryToTheme>): string {
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
