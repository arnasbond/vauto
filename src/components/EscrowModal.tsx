"use client";

import { Check, Clock, CreditCard, Package, QrCode, ShieldCheck, Sparkles, Truck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ParcelLockerPicker } from "@/components/escrow/ParcelLockerPicker";
import { useVauto } from "@/context/VautoContext";
import {
  applyWardrobeNegotiationTwinFee,
  buildWardrobeEscrowContext,
  calculateNegotiationTwinBuyerFee,
  finalizeWardrobeEscrowOnClose,
  shouldApplyNegotiationTwinFee,
  WARDROBE_NEGOTIATION_TWIN_FEE_LABEL,
} from "@/lib/monetization-wardrobe";
import {
  apiConfirmEscrowDelivery,
  apiEscrowBillingStatus,
  apiEscrowCheckout,
  apiEscrowShippingLabel,
  apiExpressEscrowLocker,
} from "@/lib/api/client";
import { isAiProxyAvailable, isDataApiEnabled } from "@/lib/api/config";
import { createEscrow, patchEscrow } from "@/lib/escrow";
import {
  activateExpressEscrow24h,
  buildExpressSellerNotification,
  expressClaimRemainingMs,
  formatExpressDeadline,
  simulateCourierLockerDelivery,
} from "@/lib/order-agent";
import { speakBuddyMessage } from "@/lib/buddy-voice";
import {
  PAYMENT_PROVIDERS,
  createDemoPaymentIntent,
  type PaymentProviderId,
} from "@/lib/payments/payment-provider";
import {
  BUYER_PROTECTION_FEE_PERCENT,
  buyerProtectionExplanation,
  calculateBuyerProtectionFee,
  calculateBuyerTotal,
} from "@/lib/payments/buyer-protection";
import {
  COURIER_LOCKER_DELIVERED_STATUS,
  SHIPPING_PROVIDERS,
  createDemoShipmentLabel,
  type ParcelSize,
  type ShippingProviderId,
} from "@/lib/shipping/shipping-provider";
import type { ParcelLocker } from "@/lib/shipping/parcel-lockers";
import type { ChatThread, EscrowStatus, EscrowTransaction } from "@/lib/types";

type EscrowStep = "offer" | "paying" | "label" | "shipping" | "done";

const CHECKOUT_PROVIDERS = SHIPPING_PROVIDERS.filter((p) =>
  ["omniva", "lp_express"].includes(p.id)
);

interface EscrowModalProps {
  chat: ChatThread;
  amount: number;
  escrow?: EscrowTransaction | null;
  sellerName?: string;
  onClose: () => void;
  onUpdate: (escrow: EscrowTransaction) => void;
  onSellerNotify?: (message: string) => void;
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
  sellerName = "Pardavėjas",
  onClose,
  onUpdate,
  onSellerNotify,
}: EscrowModalProps) {
  const { chameleonTheme, listings, showToast, user } = useVauto();
  const listing = useMemo(
    () => listings.find((l) => l.id === chat.listingId),
    [listings, chat.listingId]
  );
  const monetizationCtx = useMemo(
    () => buildWardrobeEscrowContext(chameleonTheme, chat, listing),
    [chameleonTheme, chat, listing]
  );
  const twinFee = useMemo(
    () =>
      shouldApplyNegotiationTwinFee(monetizationCtx)
        ? calculateNegotiationTwinBuyerFee(amount)
        : 0,
    [monetizationCtx, amount]
  );
  const freeCredits = user.freeProtectionCredits ?? 0;
  const protectionFee = useMemo(
    () => calculateBuyerProtectionFee(amount, freeCredits),
    [amount, freeCredits]
  );
  const buyerTotal = useMemo(
    () => Math.round((calculateBuyerTotal(amount, freeCredits) + twinFee) * 100) / 100,
    [amount, twinFee, freeCredits]
  );

  const [step, setStep] = useState<EscrowStep>(() => stepFromEscrow(escrow));
  const [stripeEscrowLive, setStripeEscrowLive] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState<PaymentProviderId>("montonio");
  const [shippingProvider, setShippingProvider] = useState<ShippingProviderId>("omniva");
  const [parcelSize, setParcelSize] = useState<ParcelSize>("M");
  const [selectedLocker, setSelectedLocker] = useState<ParcelLocker | null>(null);
  const [trackingCode, setTrackingCode] = useState(escrow?.trackingCode ?? "");
  const [qrPayload, setQrPayload] = useState("");
  const [paymentLabel, setPaymentLabel] = useState("Stripe saugus mokėjimas");
  const [shipmentInstructions, setShipmentInstructions] = useState("");
  const [claimRemaining, setClaimRemaining] = useState(() =>
    escrow ? expressClaimRemainingMs(escrow) : 0
  );

  useEffect(() => {
    if (!isDataApiEnabled()) return;
    void apiEscrowBillingStatus().then((s) => setStripeEscrowLive(Boolean(s?.live)));
  }, []);

  useEffect(() => {
    setStep(stepFromEscrow(escrow));
    if (escrow?.trackingCode) setTrackingCode(escrow.trackingCode);
  }, [escrow]);

  useEffect(() => {
    if (!escrow?.expressEscrow24h || escrow.status !== "delivered") return;
    const tick = () => setClaimRemaining(expressClaimRemainingMs(escrow));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [escrow]);

  const persist = (
    status: EscrowStatus,
    code?: string,
    patch: Partial<EscrowTransaction> = {}
  ) => {
    const base = escrow ?? createEscrow(chat, amount);
    let next = patchEscrow(base, {
      status,
      buyerProtectionFee: protectionFee,
      buyerTotal,
      ...(code ? { trackingCode: code } : {}),
      ...patch,
    });
    if (status === "paid" || status === "paying") {
      next = applyWardrobeNegotiationTwinFee(next, monetizationCtx);
    }
    if (status === "completed") {
      next = finalizeWardrobeEscrowOnClose(next, monetizationCtx);
      if (next.negotiationTwinFeeApplied && next.buyerServiceFeeEur) {
        showToast(
          `Sandoris uždarytas. ${WARDROBE_NEGOTIATION_TWIN_FEE_LABEL}: ${next.buyerServiceFeeEur.toFixed(2)} € (3%).`,
          "info"
        );
      }
    }
    onUpdate(next);
    return next;
  };

  const notifySellerExpress = (message: string) => {
    onSellerNotify?.(message);
    speakBuddyMessage(message, { enabled: true });
  };

  const handleLockerDelivery = async () => {
    const base = escrow ?? createEscrow(chat, amount);
    const local = simulateCourierLockerDelivery(
      patchEscrow(base, {
        status: "shipped",
        trackingCode: trackingCode || escrow?.trackingCode,
        deliveryStatus: "in_transit",
      }),
      shippingProvider
    );

    if (isAiProxyAvailable()) {
      const res = await apiExpressEscrowLocker({
        escrow: local,
        courierProvider: shippingProvider,
        sellerName,
        listingTitle: chat.listingTitle,
      });
      if (res) {
        onUpdate({ ...res.escrow, deliveryStatus: "delivered_to_locker" });
        notifySellerExpress(res.sellerNotification);
        return;
      }
    }

    const next = activateExpressEscrow24h(local, shippingProvider);
    onUpdate({ ...next, deliveryStatus: "delivered_to_locker" });
    notifySellerExpress(buildExpressSellerNotification(sellerName, chat.listingTitle));
  };

  const handlePay = async () => {
    if (!selectedLocker) {
      showToast("Pasirinkite pristatymo paštomatą.", "info");
      return;
    }

    const base = escrow ?? createEscrow(chat, amount);
    const draft = patchEscrow(base, {
      status: "paying",
      buyerProtectionFee: protectionFee,
      buyerTotal,
      shippingProvider,
      shippingLockerId: selectedLocker.id,
      shippingLockerName: selectedLocker.name,
      deliveryStatus: "pending",
    });

    setPaymentLabel(
      stripeEscrowLive ? "Stripe Connect escrow" : PAYMENT_PROVIDERS.find((p) => p.id === paymentProvider)?.label ?? "Mokėjimas"
    );
    setStep("paying");
    onUpdate(draft);

    if (stripeEscrowLive && isDataApiEnabled()) {
      const res = await apiEscrowCheckout({
        escrow: draft,
        listingTitle: chat.listingTitle,
        shippingProvider,
        shippingLockerId: selectedLocker.id,
        shippingLockerName: selectedLocker.name,
      });
      if (res.ok && res.data.checkoutUrl) {
        window.location.assign(res.data.checkoutUrl);
        return;
      }
      showToast(res.ok ? "Nepavyko pradėti mokėjimo." : res.error, "error");
    }

    setTimeout(() => {
      const payment = createDemoPaymentIntent(amount, paymentProvider);
      setPaymentLabel(payment.provider.label);
      persist("paid", undefined, {
        stripePaymentIntentId: undefined,
        deliveryStatus: "awaiting_shipment",
      });
      setStep("label");
    }, 1500);
  };

  const handleConfirmLabel = async () => {
    const escrowId = (escrow ?? createEscrow(chat, amount)).id;

    if (isDataApiEnabled()) {
      const res = await apiEscrowShippingLabel({
        escrowId,
        providerId: shippingProvider,
        parcelSize,
        lockerId: selectedLocker?.id ?? escrow?.shippingLockerId,
        lockerName: selectedLocker?.name ?? escrow?.shippingLockerName,
        userId: user.id,
      });
      if (res.ok) {
        setTrackingCode(res.data.label.trackingCode);
        setQrPayload(res.data.label.qrPayload);
        setShipmentInstructions(res.data.label.instructions);
        onUpdate(res.data.escrow);
        setStep("shipping");
        return;
      }
    }

    const label = createDemoShipmentLabel({
      providerId: shippingProvider,
      parcelSize,
      listingTitle: chat.listingTitle,
      amount,
    });
    setTrackingCode(label.trackingCode);
    setQrPayload(label.qrPayload);
    setShipmentInstructions(label.instructions);
    persist("label_sent", label.trackingCode, {
      shippingLabelId: label.trackingCode,
      deliveryStatus: "label_created",
    });
    setStep("shipping");
  };

  const handleMarkShipped = () => {
    persist("shipped", trackingCode || escrow?.trackingCode, {
      deliveryStatus: "in_transit",
    });
  };

  const handleComplete = async () => {
    const base = persist("completed", trackingCode || escrow?.trackingCode, {
      buyerConfirmed: true,
      deliveryStatus: "delivered_confirmed",
    });

    if (isDataApiEnabled()) {
      const res = await apiConfirmEscrowDelivery(base.id, user.id);
      if (res.ok && res.data.escrow) {
        onUpdate(res.data.escrow);
      } else if (!res.ok && stripeEscrowLive) {
        showToast(res.error, "error");
      }
    }

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
            {stripeEscrowLive && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-800">
                Stripe Escrow
              </span>
            )}
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
              Pinigai įšaldomi platformos escrow sąskaitoje, kol patvirtinsite
              prekės gavimą. Po patvirtinimo lėšos perduodamos pardavėjui per
              Stripe Connect.
            </p>
            <div className="mt-4 rounded-2xl bg-gray-50 p-4">
              <p className="text-xs text-[var(--vauto-text-muted)]">Prekė</p>
              <p className="text-lg font-bold text-[var(--vauto-text)]">
                {amount.toFixed(2)} €
              </p>
              <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>
                    Pirkėjo apsauga ({BUYER_PROTECTION_FEE_PERCENT}%)
                    {freeCredits > 0 ? " — nemokamai" : ""}
                  </span>
                  <span className="font-semibold">
                    {freeCredits > 0 ? (
                      <>
                        <span className="mr-1 text-slate-400 line-through">
                          {calculateBuyerProtectionFee(amount, 0).toFixed(2)} €
                        </span>
                        0.00 €
                      </>
                    ) : (
                      `${protectionFee.toFixed(2)} €`
                    )}
                  </span>
                </div>
                {freeCredits > 0 && (
                  <p className="text-[10px] text-emerald-600">
                    Naudojamas referral kreditas · liko {freeCredits}
                  </p>
                )}
                {twinFee > 0 && (
                  <div className="flex justify-between">
                    <span>{WARDROBE_NEGOTIATION_TWIN_FEE_LABEL}</span>
                    <span className="font-semibold">{twinFee.toFixed(2)} €</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-[var(--vauto-orange)]">
                  <span>Iš viso</span>
                  <span>{buyerTotal.toFixed(2)} €</span>
                </div>
              </div>
            </div>
            <div className="mt-3 flex gap-2 rounded-xl border border-[#bfdbfe] bg-[#eef6ff] p-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#1167b1]" />
              <p className="text-xs leading-relaxed text-slate-700">
                {buyerProtectionExplanation()}
              </p>
            </div>
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold text-slate-500">
                Siuntimo partneris
              </p>
              <div className="grid gap-2">
                {CHECKOUT_PROVIDERS.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => {
                      setShippingProvider(provider.id);
                      setSelectedLocker(null);
                    }}
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
              <ParcelLockerPicker
                providerId={shippingProvider}
                selectedId={selectedLocker?.id ?? escrow?.shippingLockerId}
                originLocation={listing?.location}
                onSelect={setSelectedLocker}
              />
            </div>
            {!stripeEscrowLive && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold text-slate-500">
                  Mokėjimo būdas
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
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => void handlePay()}
              disabled={!selectedLocker}
              className="mt-6 w-full rounded-2xl bg-[var(--vauto-blue)] py-3.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Mokėti saugiai — {buyerTotal.toFixed(2)} €
            </button>
          </>
        )}

        {step === "paying" && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[var(--vauto-blue)]/20 border-t-[var(--vauto-blue)]" />
            <p className="text-sm font-medium">
              Apdorojamas mokėjimas per {paymentLabel}...
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Lėšos bus sulaikytos iki gavimo patvirtinimo.
            </p>
          </div>
        )}

        {step === "label" && (
          <>
            <div className="rounded-2xl border border-dashed border-[var(--vauto-blue)]/40 bg-[var(--vauto-blue)]/5 p-4">
              <div className="flex items-center gap-3">
                <Package className="h-10 w-10 shrink-0 text-[var(--vauto-blue)]" />
                <div>
                  <p className="text-sm font-semibold">Mokėjimas gautas ir įšaldytas</p>
                  <p className="text-xs text-[var(--vauto-text-muted)]">
                    Sugeneruokite siuntos lipduką pardavėjui.
                  </p>
                  {escrow?.shippingLockerName && (
                    <p className="mt-1 text-xs text-slate-600">
                      Pristatymas: {escrow.shippingLockerName}
                    </p>
                  )}
                </div>
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
              onClick={() => void handleConfirmLabel()}
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
                onClick={() => void handleLockerDelivery()}
                className="rounded-xl bg-[#1167b1] py-3 text-xs font-semibold text-white"
              >
                {COURIER_LOCKER_DELIVERED_STATUS}
              </button>
            </div>
            {escrow?.expressEscrow24h && escrow.status === "delivered" && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2 text-amber-900">
                  <Clock className="h-4 w-4 shrink-0" />
                  <p className="text-xs font-semibold">24h express escrow</p>
                </div>
                <p className="mt-1 text-xs text-amber-800">
                  Pirkėjas turi {formatExpressDeadline(escrow)} pasimatuoti. Jei pretenzijos
                  nebus — pinigai pervedami automatiškai.
                </p>
                {claimRemaining > 0 && (
                  <p className="mt-1 font-mono text-[10px] text-amber-700">
                    Liko: {Math.ceil(claimRemaining / 3_600_000)} val.
                  </p>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => void handleComplete()}
              className="mt-3 w-full rounded-xl bg-green-600 py-3 text-xs font-semibold text-white"
            >
              Patvirtinti gavimą
            </button>
          </>
        )}

        {step === "done" && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <p className="font-semibold text-[var(--vauto-text)]">
              Sandoris užbaigtas!
            </p>
            <p className="mt-1 text-sm text-[var(--vauto-text-muted)]">
              Lėšos perduotos pardavėjui. Ačiū, kad naudojatės VAUTO apsauga.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
