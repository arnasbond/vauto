"use client";

import { Check, CreditCard, Package, QrCode, ShieldCheck, Truck, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  createEscrow,
  patchEscrow,
} from "@/lib/escrow";
import {
  PAYMENT_PROVIDERS,
  createDemoPaymentIntent,
  type PaymentProviderId,
} from "@/lib/payments/payment-provider";
import {
  SHIPPING_PROVIDERS,
  createDemoShipmentLabel,
  type ParcelSize,
  type ShippingProviderId,
} from "@/lib/shipping/shipping-provider";
import type { ChatThread, EscrowStatus, EscrowTransaction } from "@/lib/types";

type EscrowStep = "offer" | "paying" | "label" | "shipping" | "done";

interface EscrowModalProps {
  chat: ChatThread;
  amount: number;
  escrow?: EscrowTransaction | null;
  onClose: () => void;
  onUpdate: (escrow: EscrowTransaction) => void;
}

function stepFromEscrow(escrow?: EscrowTransaction | null): EscrowStep {
  if (!escrow) return "offer";
  switch (escrow.status) {
    case "paying":
      return "paying";
    case "paid":
      return "label";
    case "label_sent":
    case "shipped":
    case "delivered":
      return "shipping";
    case "completed":
      return "done";
    default:
      return "offer";
  }
}

export function EscrowModal({
  chat,
  amount,
  escrow,
  onClose,
  onUpdate,
}: EscrowModalProps) {
  const [step, setStep] = useState<EscrowStep>(() => stepFromEscrow(escrow));
  const [paymentProvider, setPaymentProvider] = useState<PaymentProviderId>("montonio");
  const [shippingProvider, setShippingProvider] = useState<ShippingProviderId>("omniva");
  const [parcelSize, setParcelSize] = useState<ParcelSize>("M");
  const [trackingCode, setTrackingCode] = useState(escrow?.trackingCode ?? "");
  const [qrPayload, setQrPayload] = useState("");
  const [paymentLabel, setPaymentLabel] = useState("Montonio Bank Link");
  const [shipmentInstructions, setShipmentInstructions] = useState("");

  useEffect(() => {
    setStep(stepFromEscrow(escrow));
    if (escrow?.trackingCode) setTrackingCode(escrow.trackingCode);
  }, [escrow]);

  const persist = (status: EscrowStatus, code?: string) => {
    const base = escrow ?? createEscrow(chat, amount);
    const next = patchEscrow(base, {
      status,
      ...(code ? { trackingCode: code } : {}),
    });
    onUpdate(next);
    return next;
  };

  const handlePay = () => {
    const provider =
      PAYMENT_PROVIDERS.find((p) => p.id === paymentProvider) ??
      PAYMENT_PROVIDERS[0];
    setPaymentLabel(provider.label);
    setStep("paying");
    persist("paying");
    setTimeout(() => {
      const payment = createDemoPaymentIntent(amount, paymentProvider);
      setPaymentLabel(payment.provider.label);
      persist("paid");
      setStep("label");
    }, 1500);
  };

  const handleConfirmLabel = () => {
    const label = createDemoShipmentLabel({
      providerId: shippingProvider,
      parcelSize,
      listingTitle: chat.listingTitle,
      amount,
    });
    setTrackingCode(label.trackingCode);
    setQrPayload(label.qrPayload);
    setShipmentInstructions(label.instructions);
    persist("label_sent", label.trackingCode);
    setStep("shipping");
  };

  const handleMarkShipped = () => {
    persist("shipped", trackingCode || escrow?.trackingCode);
  };

  const handleComplete = () => {
    persist("completed", trackingCode || escrow?.trackingCode);
    setStep("done");
    setTimeout(onClose, 1600);
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
              Pinigai laikomi escrow sąskaitoje, kol pirkėjas gauna prekę.
              Mokėjimo ir siuntos provideriai dabar demo režimu, bet API
              sluoksnis paruoštas Montonio/Kevin ir paštomatų integracijoms.
            </p>
            <div className="mt-4 rounded-2xl bg-gray-50 p-4">
              <p className="text-xs text-[var(--vauto-text-muted)]">Suma</p>
              <p className="text-2xl font-bold text-[var(--vauto-orange)]">
                {amount} €
              </p>
            </div>
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold text-slate-500">
                Mokėjimas
              </p>
              <div className="grid gap-2">
                {PAYMENT_PROVIDERS.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => setPaymentProvider(provider.id)}
                    className={`rounded-xl border p-3 text-left transition ${
                      paymentProvider === provider.id
                        ? "border-[#1167b1] bg-[#eef6ff]"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <CreditCard className="h-4 w-4 text-[#1167b1]" />
                      {provider.label}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {provider.description}
                    </span>
                  </button>
                ))}
              </div>
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
            <p className="text-sm font-medium">
              Apdorojamas mokėjimas per {paymentLabel}...
            </p>
          </div>
        )}

        {step === "label" && (
          <>
            <div className="rounded-2xl border border-dashed border-[var(--vauto-blue)]/40 bg-[var(--vauto-blue)]/5 p-4">
              <div className="flex items-center gap-3">
                <Package className="h-10 w-10 shrink-0 text-[var(--vauto-blue)]" />
                <div>
                  <p className="text-sm font-semibold">Mokėjimas gautas</p>
                  <p className="text-xs text-[var(--vauto-text-muted)]">
                    Pasirinkite siuntimo partnerį ir sugeneruokite QR lipduką.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                {SHIPPING_PROVIDERS.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => setShippingProvider(provider.id)}
                    className={`rounded-xl border p-3 text-left transition ${
                      shippingProvider === provider.id
                        ? "border-[#f97316] bg-orange-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Truck className="h-4 w-4 text-[#f97316]" />
                      {provider.label}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {provider.description}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                {(["S", "M", "L"] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setParcelSize(size)}
                    className={`flex-1 rounded-lg border py-2 text-xs font-bold ${
                      parcelSize === size
                        ? "border-[#1167b1] bg-[#eef6ff] text-[#1167b1]"
                        : "border-slate-200 text-slate-500"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={handleConfirmLabel}
              className="mt-6 w-full rounded-2xl bg-[var(--vauto-orange)] py-3.5 text-sm font-semibold text-white"
            >
              Generuoti QR siuntos lipduką
            </button>
          </>
        )}

        {step === "shipping" && (
          <>
            <div className="rounded-2xl border border-[#bfdbfe] bg-[#eef6ff] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white text-[#1167b1] shadow-sm">
                  <QrCode className="h-8 w-8" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    QR lipdukas paruoštas
                  </p>
                  <p className="text-xs text-slate-600">
                    {trackingCode || escrow?.trackingCode}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {shipmentInstructions ||
                      "Pardavėjas gali nuskenuoti QR paštomate."}
                  </p>
                </div>
              </div>
              {qrPayload && (
                <p className="mt-3 break-all rounded-lg bg-white p-2 font-mono text-[10px] text-slate-500">
                  {qrPayload}
                </p>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleMarkShipped}
                className="rounded-xl border border-[#1167b1] bg-white py-3 text-xs font-semibold text-[#1167b1]"
              >
                Pažymėti išsiųsta
              </button>
              <button
                type="button"
                onClick={handleComplete}
                className="rounded-xl bg-green-600 py-3 text-xs font-semibold text-white"
              >
                Patvirtinti gavimą
              </button>
            </div>
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
