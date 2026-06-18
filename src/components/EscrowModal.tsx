"use client";

import { Check, Package, ShieldCheck, X } from "lucide-react";
import { useState } from "react";

type EscrowStep = "offer" | "paying" | "label" | "done";

interface EscrowModalProps {
  amount: number;
  onClose: () => void;
}

export function EscrowModal({ amount, onClose }: EscrowModalProps) {
  const [step, setStep] = useState<EscrowStep>("offer");

  const handlePay = () => {
    setStep("paying");
    setTimeout(() => setStep("label"), 1500);
  };

  const handleConfirmLabel = () => {
    setStep("done");
    setTimeout(onClose, 2000);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[var(--vauto-blue)]" />
            <h2 className="font-semibold text-[var(--vauto-text)]">
              Saugus mokėjimas
            </h2>
          </div>
          {step !== "paying" && step !== "done" && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-[var(--vauto-text-muted)] hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {step === "offer" && (
          <>
            <p className="text-sm text-[var(--vauto-text-muted)]">
              Pinigai laikomi escrow sąskaitoje, kol gausite prekę. Pardavėjas
              gauna siuntos lipduką tik po apmokėjimo.
            </p>
            <div className="mt-4 rounded-2xl bg-gray-50 p-4">
              <p className="text-xs text-[var(--vauto-text-muted)]">Suma</p>
              <p className="text-2xl font-bold text-[var(--vauto-orange)]">
                {amount} €
              </p>
            </div>
            <button
              type="button"
              onClick={handlePay}
              className="mt-6 w-full rounded-2xl bg-[var(--vauto-blue)] py-3.5 text-sm font-semibold text-white"
            >
              Mokėti saugiai
            </button>
          </>
        )}

        {step === "paying" && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[var(--vauto-blue)]/20 border-t-[var(--vauto-blue)]" />
            <p className="text-sm font-medium">Apdorojamas mokėjimas...</p>
          </div>
        )}

        {step === "label" && (
          <>
            <div className="flex items-center gap-3 rounded-2xl border border-dashed border-[var(--vauto-blue)]/40 bg-[var(--vauto-blue)]/5 p-4">
              <Package className="h-10 w-10 shrink-0 text-[var(--vauto-blue)]" />
              <div>
                <p className="text-sm font-semibold">Siuntos lipdukas paruoštas</p>
                <p className="text-xs text-[var(--vauto-text-muted)]">
                  LP Express · Vilnius → Panevėžys
                </p>
                <p className="mt-1 font-mono text-xs text-[var(--vauto-text-muted)]">
                  #VAUTO-2026-8842
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleConfirmLabel}
              className="mt-6 w-full rounded-2xl bg-[var(--vauto-orange)] py-3.5 text-sm font-semibold text-white"
            >
              Siųsti lipduką pardavėjui
            </button>
          </>
        )}

        {step === "done" && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <p className="font-semibold text-[var(--vauto-text)]">
              Sandoris inicijuotas!
            </p>
            <p className="mt-1 text-sm text-[var(--vauto-text-muted)]">
              Pardavėjas gavo siuntos instrukcijas.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
