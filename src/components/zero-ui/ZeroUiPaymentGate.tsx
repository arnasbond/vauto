"use client";

import { CreditCard, Mic, Sparkles, Wallet, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useVauto } from "@/context/VautoContext";
import { speakBuddyMessage, stopBuddySpeech } from "@/lib/buddy-voice";
import {
  SMART_BOOST_PRICE_EUR,
  VOICE_PAY_CONFIRM_PHRASE,
  type ZeroUiMicroPaymentIntent,
} from "@/lib/monetization-engine";
import { isVoiceSearchSupported, startVoiceSearch } from "@/lib/voice-search";
import { sanitizeSpeechTranscript } from "@/lib/speech-transcript";

type GateStep = "confirm" | "paying" | "success";

interface ZeroUiPaymentGateProps {
  intent: ZeroUiMicroPaymentIntent;
  onSuccess: () => void;
  onCancel: () => void;
  embedded?: boolean;
}

function productTitle(product: ZeroUiMicroPaymentIntent["product"]): string {
  if (product === "region_stats") return "Regiono paklausos statistika";
  if (product === "smart_boost") return "Smart Boost";
  return "Mikro-mokėjimas";
}

export function ZeroUiPaymentGate({
  intent,
  onSuccess,
  onCancel,
  embedded = false,
}: ZeroUiPaymentGateProps) {
  const { user, updateUser, showToast } = useVauto();
  const [step, setStep] = useState<GateStep>("confirm");
  const [recording, setRecording] = useState(false);
  const walletBalance = user.walletBalance ?? 0;
  const canUseWallet = walletBalance >= intent.price;
  const confirmPhrase = intent.voiceConfirmPhrase ?? VOICE_PAY_CONFIRM_PHRASE;

  useEffect(() => {
    speakBuddyMessage(
      `${productTitle(intent.product)} — ${intent.price.toFixed(2)} €. Pasakykite „${confirmPhrase}“ arba patvirtinkite ekrane.`,
      { enabled: true }
    );
    return () => stopBuddySpeech();
  }, [intent.price, intent.product, confirmPhrase]);

  const completePayment = useCallback(() => {
    setStep("paying");
    window.setTimeout(() => {
      const balance = user.walletBalance ?? 0;
      if (canUseWallet) {
        updateUser({ walletBalance: balance - intent.price });
      }
      setStep("success");
      showToast(`${productTitle(intent.product)} aktyvuotas`, "success");
      window.setTimeout(() => {
        onSuccess();
      }, 1200);
    }, 900);
  }, [canUseWallet, intent.price, intent.product, onSuccess, showToast, updateUser, user.walletBalance]);

  const handleVoiceConfirm = () => {
    if (!isVoiceSearchSupported() || recording) return;
    setRecording(true);
    const session = startVoiceSearch({});
    void session.promise.then((text) => {
      setRecording(false);
      const t = sanitizeSpeechTranscript(text ?? "").toLowerCase();
      if (
        t.includes("taip") ||
        t.includes("apmok") ||
        t.includes("boost") ||
        t.includes("iškel")
      ) {
        completePayment();
      } else {
        showToast("Pasakykite „Taip, apmokėti“", "info");
      }
    });
  };

  const shellClass = embedded
    ? "rounded-2xl border border-[#bfdbfe] bg-gradient-to-br from-[#eef6ff] to-white p-5 shadow-sm"
    : "fixed inset-0 z-[260] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center";

  const cardClass = embedded
    ? "w-full"
    : "w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl";

  return (
    <div className={shellClass} role="dialog" aria-label="Mokėjimo patvirtinimas">
      <div className={cardClass}>
        {step === "confirm" && (
          <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[var(--vauto-teal)]" />
                <h3 className="font-display text-lg font-bold text-[#111827]">
                  {productTitle(intent.product)}
                </h3>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-full p-1 text-[#6b7280] hover:bg-[#f3f4f6]"
                aria-label="Uždaryti"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm leading-relaxed text-[#374151]">{intent.reason}</p>

            <div className="mt-4 rounded-xl border border-[#dbeafe] bg-[#f8fafc] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-[#6b7280]">Suma</p>
              <p className="font-display text-2xl font-bold text-[#1167b1]">
                {intent.price.toFixed(2)} €
              </p>
              {intent.product === "smart_boost" && intent.price === SMART_BOOST_PRICE_EUR && (
                <p className="mt-1 text-xs text-[#6b7280]">
                  Padidina skelbimo matomumą 7 dienoms
                </p>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-[#6b7280]">
              <Wallet className="h-4 w-4" />
              Piniginė: {walletBalance.toFixed(2)} €
              {!canUseWallet && " — demo režime mokėjimas vis tiek leidžiamas"}
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={completePayment}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1167b1] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0d5a9a]"
              >
                <CreditCard className="h-4 w-4" />
                {confirmPhrase}
              </button>
              {isVoiceSearchSupported() && (
                <button
                  type="button"
                  onClick={handleVoiceConfirm}
                  disabled={recording}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl border border-[#d1d5db] px-4 py-3 text-sm font-medium text-[#374151] hover:bg-[#f9fafb] ${
                    recording ? "animate-pulse border-[#1167b1] text-[#1167b1]" : ""
                  }`}
                >
                  <Mic className="h-4 w-4" />
                  {recording ? "Klausausi…" : "Patvirtinti balsu"}
                </button>
              )}
              <button
                type="button"
                onClick={onCancel}
                className="py-2 text-sm text-[#6b7280] hover:text-[#111827]"
              >
                Atšaukti
              </button>
            </div>
          </>
        )}

        {step === "paying" && (
          <div className="py-10 text-center">
            <Sparkles className="mx-auto h-8 w-8 animate-pulse text-[var(--vauto-teal)]" />
            <p className="mt-3 text-sm font-medium text-[#374151]">Apdorojamas mokėjimas…</p>
          </div>
        )}

        {step === "success" && (
          <div className="py-10 text-center">
            <p className="font-display text-lg font-bold text-emerald-600">Mokėjimas patvirtintas</p>
            <p className="mt-2 text-sm text-[#6b7280]">{productTitle(intent.product)} aktyvuotas</p>
          </div>
        )}
      </div>
    </div>
  );
}
