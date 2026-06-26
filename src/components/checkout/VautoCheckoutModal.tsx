"use client";

import { useEffect, useRef, useState } from "react";
import {
  Building2,
  Check,
  CreditCard,
  Landmark,
  Lock,
  Shield,
  X,
} from "lucide-react";
import type { CheckoutSession } from "@/lib/monetization-catalog";
import { calcVatBreakdown } from "@/lib/monetization-catalog";
import { cn } from "@/lib/cn";

type PayChannel = "card" | "swedbank" | "seb" | "siauliu" | "revolut";
type Step = "method" | "paying" | "success";

const BANKS: { id: PayChannel; label: string; accent: string }[] = [
  { id: "swedbank", label: "Swedbank", accent: "#ff6600" },
  { id: "seb", label: "SEB", accent: "#00843d" },
  { id: "siauliu", label: "Šiaulių bankas", accent: "#003366" },
  { id: "revolut", label: "Revolut", accent: "#191c1f" },
];

interface VautoCheckoutModalProps {
  session: CheckoutSession | null;
  onClose: () => void;
  onComplete: (session: CheckoutSession, paymentMethod: string) => void;
}

export function VautoCheckoutModal({
  session,
  onClose,
  onComplete,
}: VautoCheckoutModalProps) {
  const [channel, setChannel] = useState<PayChannel>("card");
  const [step, setStep] = useState<Step>("method");
  const [cardNumber, setCardNumber] = useState("");
  const completedRef = useRef(false);

  useEffect(() => {
    if (session) {
      setStep("method");
      setChannel("card");
      setCardNumber("");
      completedRef.current = false;
    }
  }, [session]);

  if (!session) return null;

  const { amountNet, vatAmount, amountGross } = calcVatBreakdown(
    session.amountEur,
    session.vatRate
  );

  const paymentLabel =
    channel === "card"
      ? "Banko kortelė"
      : BANKS.find((b) => b.id === channel)?.label ?? "BankLink";

  const handlePay = () => {
    if (channel === "card" && cardNumber.replace(/\s/g, "").length < 12) return;
    setStep("paying");
    setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete(session, paymentLabel);
      }
      setStep("success");
      setTimeout(onClose, 2200);
    }, 1600);
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center">
      <div
        className={cn(
          "max-h-[94dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[var(--vauto-border)] bg-[var(--vauto-surface)] p-6 shadow-2xl sm:rounded-3xl",
          "text-[var(--vauto-text)]"
        )}
        role="dialog"
        aria-modal
        aria-labelledby="vauto-checkout-title"
      >
        {step === "method" && (
          <>
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--vauto-teal)]">
                  VAUTO Checkout
                </p>
                <h2 id="vauto-checkout-title" className="mt-1 text-lg font-bold">
                  {session.lineTitle}
                </h2>
                <p className="mt-1 text-sm text-[var(--vauto-text-muted)]">
                  {session.lineDescription}
                </p>
                {session.listingTitle && (
                  <p className="mt-2 text-xs text-[var(--vauto-text-muted)]">
                    Skelbimas: {session.listingTitle}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1 text-[var(--vauto-text-muted)] hover:bg-[var(--vauto-border)]/40"
                aria-label="Uždaryti"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-5 rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)]/60 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-[var(--vauto-text-muted)]">Mokėtina suma</span>
                <span className="text-2xl font-bold text-[var(--vauto-orange)]">
                  {amountGross.toFixed(2)} €
                </span>
              </div>
              <div className="mt-2 space-y-1 text-xs text-[var(--vauto-text-muted)]">
                <div className="flex justify-between">
                  <span>Suma be PVM</span>
                  <span>{amountNet.toFixed(2)} €</span>
                </div>
                <div className="flex justify-between">
                  <span>PVM ({Math.round(session.vatRate * 100)}%)</span>
                  <span>{vatAmount.toFixed(2)} €</span>
                </div>
              </div>
            </div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
              Mokėjimo būdas
            </p>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {BANKS.map((bank) => (
                <button
                  key={bank.id}
                  type="button"
                  onClick={() => setChannel(bank.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm font-medium transition",
                    channel === bank.id
                      ? "border-[var(--vauto-teal)] bg-[var(--vauto-teal)]/10 ring-1 ring-[var(--vauto-teal)]"
                      : "border-[var(--vauto-border)] bg-[var(--vauto-bg)]/40 hover:border-[var(--vauto-teal)]/40"
                  )}
                >
                  <Landmark className="h-4 w-4 shrink-0" style={{ color: bank.accent }} />
                  {bank.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setChannel("card")}
              className={cn(
                "mb-4 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition",
                channel === "card"
                  ? "border-[var(--vauto-teal)] bg-[var(--vauto-teal)]/10 ring-1 ring-[var(--vauto-teal)]"
                  : "border-[var(--vauto-border)] bg-[var(--vauto-bg)]/40"
              )}
            >
              <CreditCard className="h-5 w-5 text-[var(--vauto-teal)]" />
              <div>
                <p className="text-sm font-medium">Banko kortelė</p>
                <p className="text-xs text-[var(--vauto-text-muted)]">Visa / Mastercard</p>
              </div>
            </button>

            {channel === "card" && (
              <div className="mb-4 space-y-2">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Kortelės numeris"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  className="w-full rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)] px-4 py-3 text-sm outline-none focus:border-[var(--vauto-teal)]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="MM/YY"
                    className="rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)] px-4 py-3 text-sm outline-none focus:border-[var(--vauto-teal)]"
                  />
                  <input
                    type="text"
                    placeholder="CVC"
                    className="rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)] px-4 py-3 text-sm outline-none focus:border-[var(--vauto-teal)]"
                  />
                </div>
              </div>
            )}

            {channel !== "card" && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)]/50 p-3 text-xs text-[var(--vauto-text-muted)]">
                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--vauto-teal)]" />
                <p>
                  Paspaudę „Apmokėti“ būsite nukreipti į {paymentLabel} BankLink
                  simuliatorių. Tai demonstracinis mokėjimas — tikros lėšos nėra
                  nuskaitomos.
                </p>
              </div>
            )}

            <p className="mb-4 flex items-center gap-1.5 text-[10px] text-[var(--vauto-text-muted)]">
              <Shield className="h-3.5 w-3.5 text-[var(--vauto-teal)]" />
              <Lock className="h-3 w-3" />
              SSL šifruotas demonstracinis atsiskaitymas
            </p>

            <button
              type="button"
              onClick={handlePay}
              disabled={channel === "card" && cardNumber.replace(/\s/g, "").length < 12}
              className="w-full min-h-[52px] rounded-2xl bg-[var(--vauto-teal)] py-3.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              Apmokėti {amountGross.toFixed(2)} €
            </button>
          </>
        )}

        {step === "paying" && (
          <div className="py-12 text-center">
            <div className="mx-auto mb-4 h-11 w-11 animate-spin rounded-full border-4 border-[var(--vauto-teal)]/20 border-t-[var(--vauto-teal)]" />
            <p className="text-sm font-medium">Apdorojamas mokėjimas…</p>
            <p className="mt-1 text-xs text-[var(--vauto-text-muted)]">{paymentLabel}</p>
          </div>
        )}

        {step === "success" && (
          <div className="py-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
              <Check className="h-8 w-8 text-emerald-500" />
            </div>
            <p className="text-lg font-bold">Mokėjimas sėkmingas!</p>
            <p className="mt-2 text-sm text-[var(--vauto-text-muted)]">
              Sąskaita-faktūra sugeneruota ir pasiekiama kabinete.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
