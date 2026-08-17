"use client";

import { Check, Clock, CreditCard, Package, ShieldCheck, Sparkles, Truck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  formatOmnivaParcelPrice,
  OMNIVA_PARCEL_SIZE_HINTS,
  resolveDefaultParcelSize,
} from "@/lib/shipping/omniva-parcel-prices";
import { buildOmnivaSellerNotifyText } from "@/lib/shipping/omniva-seller-notify";
import {
  OMNIVA_LOCKER_OVERSIZE_NOTE,
  resolveOmnivaLockerEligibility,
} from "@vauto/shared/omniva-locker-eligibility";
import type { ParcelLocker } from "@/lib/shipping/shipping-routing";
import type { ChatThread, EscrowStatus, EscrowTransaction } from "@/lib/types";

type EscrowStep = "offer" | "paying" | "label" | "shipping" | "done";

/** M2: Omniva-only logistics (DPD / LP Express deferred). */
const CHECKOUT_PROVIDERS = SHIPPING_PROVIDERS.filter((p) => p.id === "omniva");

export interface EscrowSellerNotifyMeta {
  trackingCode?: string;
  qrPayload?: string;
  trackingUrl?: string;
  lockerName?: string;
  parcelSize?: string;
  mode?: "live" | "simulated";
}

interface EscrowModalProps {
  chat: ChatThread;
  amount: number;
  escrow?: EscrowTransaction | null;
  sellerName?: string;
  onClose: () => void;
  onUpdate: (escrow: EscrowTransaction) => void;
  onSellerNotify?: (message: string, meta?: EscrowSellerNotifyMeta) => void;
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
  const omnivaEligibility = useMemo(
    () =>
      resolveOmnivaLockerEligibility({
        title: listing?.title ?? chat.listingTitle,
        description: listing?.description,
        category: listing?.category,
        attributes: listing?.attributes as Record<string, unknown> | undefined,
        allowPastomatas: listing?.allowPastomatas,
      }),
    [chat.listingTitle, listing]
  );
  const availableShippingProviders = useMemo(
    () =>
      omnivaEligibility.eligible
        ? CHECKOUT_PROVIDERS
        : // Hard fence: no parcel lockers (Omniva or otherwise) for oversized / blocked categories.
          [],
    [omnivaEligibility.eligible]
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

  const router = useRouter();
  const [step, setStep] = useState<EscrowStep>(() => stepFromEscrow(escrow));
  const [stripeEscrowLive, setStripeEscrowLive] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState<PaymentProviderId>("montonio");
  const [shippingProvider, setShippingProvider] = useState<ShippingProviderId>("omniva");
  const [parcelSize, setParcelSize] = useState<ParcelSize>("M");
  const [selectedLocker, setSelectedLocker] = useState<ParcelLocker | null>(null);
  const [trackingCode, setTrackingCode] = useState(escrow?.trackingCode ?? "");
  const [labelPayload, setLabelPayload] = useState("");
  const [paymentLabel, setPaymentLabel] = useState("Stripe saugus mokėjimas");
  const [shipmentInstructions, setShipmentInstructions] = useState("");
  const [labelMode, setLabelMode] = useState<"live" | "simulated" | null>(null);
  const [claimRemaining, setClaimRemaining] = useState(() =>
    escrow ? expressClaimRemainingMs(escrow) : 0
  );

  useEffect(() => {
    if (!isDataApiEnabled()) return;
    void apiEscrowBillingStatus().then((s) => setStripeEscrowLive(Boolean(s?.live)));
  }, []);

  useEffect(() => {
    setParcelSize(
      resolveDefaultParcelSize(String(listing?.attributes?.estimatedSize ?? ""))
    );
  }, [listing?.attributes?.estimatedSize]);

  useEffect(() => {
    if (!omnivaEligibility.eligible) {
      setSelectedLocker(null);
      return;
    }
    if (
      shippingProvider === "omniva" ||
      availableShippingProviders.some((p) => p.id === shippingProvider)
    ) {
      return;
    }
    const fallback = availableShippingProviders[0]?.id;
    if (fallback) setShippingProvider(fallback);
  }, [
    availableShippingProviders,
    omnivaEligibility.eligible,
    shippingProvider,
  ]);

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
    if (omnivaEligibility.eligible && !selectedLocker) {
      showToast("Pasirinkite pristatymo paštomatą.", "info");
      return;
    }

    const base = escrow ?? createEscrow(chat, amount);
    const draft = patchEscrow(base, {
      status: "paying",
      buyerProtectionFee: protectionFee,
      buyerTotal,
      shippingProvider: omnivaEligibility.eligible ? shippingProvider : undefined,
      shippingLockerId: selectedLocker?.id,
      shippingLockerName: selectedLocker?.name ?? "Atsiėmimas vietoje / Kurjeris",
      deliveryStatus: "pending",
    });

    setPaymentLabel(
      stripeEscrowLive ? "Stripe Connect escrow" : PAYMENT_PROVIDERS.find((p) => p.id === paymentProvider)?.label ?? "Mokėjimas"
    );
    setStep("paying");
    onUpdate(draft);

    if (stripeEscrowLive && isDataApiEnabled()) {
      const res = await apiEscrowCheckout({
        listingId: chat.listingId,
        threadId: chat.id,
        shippingProvider: omnivaEligibility.eligible ? shippingProvider : "omniva",
        shippingLockerId: selectedLocker?.id ?? "pickup-courier",
        shippingLockerName: selectedLocker?.name ?? "Atsiėmimas vietoje / Kurjeris",
        userId: user.id,
      });
      if (res.ok && res.data.checkoutUrl) {
        window.location.assign(res.data.checkoutUrl);
        return;
      }
      showToast(res.ok ? "Nepavyko pradėti mokėjimo." : res.error, "error");
      // A missing payment method is a hard stop — never fall through to the
      // demo intent, or the fraud gate would be trivially bypassable.
      if (!res.ok && res.status === 402) {
        setStep("offer");
        onUpdate(patchEscrow(draft, { status: "offered" }));
        router.push("/profile/settings/?focus=payments");
        return;
      }
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
        setLabelPayload(res.data.label.qrPayload);
        setShipmentInstructions(res.data.label.instructions);
        setLabelMode(res.data.label.mode ?? "simulated");
        onUpdate(res.data.escrow);
        const notifyText = buildOmnivaSellerNotifyText({
          trackingCode: res.data.label.trackingCode,
          qrPayload: res.data.label.qrPayload,
          trackingUrl: res.data.label.trackingUrl,
          lockerName: selectedLocker?.name ?? escrow?.shippingLockerName,
          parcelSize,
          listingTitle: chat.listingTitle,
          mode: res.data.label.mode === "live" ? "live" : "simulated",
        });
        onSellerNotify?.(notifyText, {
          trackingCode: res.data.label.trackingCode,
          qrPayload: res.data.label.qrPayload,
          trackingUrl: res.data.label.trackingUrl,
          lockerName: selectedLocker?.name ?? escrow?.shippingLockerName,
          parcelSize,
          mode: res.data.label.mode === "live" ? "live" : "simulated",
        });
        setStep("shipping");
        return;
      }
      if (shippingProvider === "omniva") {
        showToast(res.error || "Omniva lipduko nepavyko sugeneruoti.", "error");
        return;
      }
    }

    // Non-Omniva / offline demo path only (M2 keeps Omniva on live API).
    if (shippingProvider === "omniva" && isDataApiEnabled()) {
      showToast("Omniva live API nepasiekiamas — bandykite dar kartą.", "error");
      return;
    }

    const label = createDemoShipmentLabel({
      providerId: shippingProvider,
      parcelSize,
      listingTitle: chat.listingTitle,
      amount,
    });
    setTrackingCode(label.trackingCode);
    setLabelPayload(label.qrPayload);
    setShipmentInstructions(label.instructions);
    setLabelMode("simulated");
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
      <div className="w-full max-w-md rounded-t-3xl border border-[var(--vauto-border)] bg-[var(--vauto-surface)] p-6 text-[var(--vauto-text)] shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[var(--vauto-blue)]" />
            <h2 className="font-semibold text-[var(--vauto-text)]">
              Saugus mokėjimas
            </h2>
            {stripeEscrowLive && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                Stripe Escrow
              </span>
            )}
          </div>
          {step !== "paying" && step !== "done" && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-[var(--vauto-text-muted)] hover:bg-[var(--vauto-border)]/40"
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
                    Platformos paslaugos mokestis ({BUYER_PROTECTION_FEE_PERCENT}%)
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
              {!omnivaEligibility.eligible ? (
                <p
                  className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950"
                  role="status"
                >
                  {omnivaEligibility.noteLt || OMNIVA_LOCKER_OVERSIZE_NOTE}
                </p>
              ) : null}
              <div className="grid gap-2">
                {availableShippingProviders.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => {
                      setShippingProvider(provider.id);
                      setSelectedLocker(null);
                    }}
                    className={`rounded-xl border p-3 text-left transition ${
                      shippingProvider === provider.id
                        ? "border-[#f97316] bg-orange-500/10"
                        : "border-[var(--vauto-border)] bg-[var(--vauto-surface)]"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-[var(--vauto-text)]">
                      <Truck className="h-4 w-4 text-[#f97316]" />
                      {provider.label}
                    </span>
                    <span className="mt-1 block text-xs text-[var(--vauto-text-muted)]">
                      {provider.description}
                    </span>
                  </button>
                ))}
              </div>
              {availableShippingProviders.length > 0 ? (
                <ParcelLockerPicker
                  providerId={shippingProvider}
                  selectedId={selectedLocker?.id ?? escrow?.shippingLockerId}
                  originLocation={listing?.location}
                  onSelect={setSelectedLocker}
                />
              ) : (
                <p className="mt-2 text-xs text-[var(--vauto-text-muted)]">
                  Atsiėmimas vietoje / kurjeris — paštomatai šiai prekei neprieinami.
                </p>
              )}
            </div>
            {!stripeEscrowLive && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold text-[var(--vauto-text-muted)]">
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
                          ? "border-[#1167b1] bg-[#1167b1]/10"
                          : "border-[var(--vauto-border)] bg-[var(--vauto-surface)]"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold text-[var(--vauto-text)]">
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
              disabled={omnivaEligibility.eligible && !selectedLocker}
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
            <p className="mt-2 text-xs text-[var(--vauto-text-muted)]">
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
                    className={`flex-1 rounded-lg border px-1 py-2 text-left ${
                      parcelSize === size
                        ? "border-[#1167b1] bg-[#eef6ff] text-[#1167b1]"
                        : "border-slate-200 text-slate-500"
                    }`}
                  >
                    <span className="block text-xs font-bold">{size}</span>
                    <span className="mt-0.5 block text-[10px] opacity-80">
                      {OMNIVA_PARCEL_SIZE_HINTS[size]}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-semibold">
                      {formatOmnivaParcelPrice(size)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleConfirmLabel()}
              className="mt-6 w-full rounded-2xl bg-[var(--vauto-orange)] py-3.5 text-sm font-semibold text-white"
            >
              Generuoti siuntos lipduką
            </button>
          </>
        )}

        {step === "shipping" && (
          <>
            <div className="rounded-2xl border border-[#1167b1]/30 bg-[#1167b1]/10 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--vauto-surface)] text-[#1167b1] shadow-sm">
                  <Package className="h-8 w-8" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--vauto-text)]">
                      Siuntos lipdukas paruoštas
                    </p>
                    {(labelMode === "simulated" || labelMode === null) && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                        Simuliacija
                      </span>
                    )}
                    {labelMode === "live" && (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                        Gyvas vežėjas
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--vauto-text-muted)]">
                    {trackingCode || escrow?.trackingCode}
                  </p>
                  <p className="mt-1 text-xs text-[var(--vauto-text-muted)]">
                    {shipmentInstructions ||
                      "Pardavėjas gali pateikti lipduką paštomate."}
                  </p>
                </div>
              </div>
              {labelPayload && (
                <p className="mt-3 break-all rounded-lg bg-[var(--vauto-surface)] p-2 font-mono text-[10px] text-[var(--vauto-text-muted)]">
                  {labelPayload}
                </p>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleMarkShipped}
                className="rounded-xl border border-[#1167b1] bg-[var(--vauto-surface)] py-3 text-xs font-semibold text-[#1167b1]"
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
