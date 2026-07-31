"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  Lock,
  Pencil,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Panel } from "@/components/ui/surface";
import { useVauto } from "@/context/VautoContext";
import {
  apiConfirmPaymentMethodSetup,
  apiCreatePaymentMethodSetup,
  apiCreatePayoutOnboarding,
  apiFetchPaymentMethods,
  apiRemovePaymentMethod,
  apiSyncPayoutStatus,
  type PaymentMethodsSummary,
} from "@/lib/api/client";

type Busy = "none" | "card" | "payout" | "remove";

const STATUS_TONE: Record<string, string> = {
  verified: "text-[var(--vauto-green,#16a34a)]",
  pending: "text-[var(--vauto-text-muted)]",
  restricted: "text-[var(--vauto-red)]",
};

function StatusLine({
  ok,
  okText,
  missingText,
}: {
  ok: boolean;
  okText: string;
  missingText: string;
}) {
  return (
    <p
      className={`flex items-center gap-1.5 text-[11px] font-medium ${
        ok ? "text-[var(--vauto-green,#16a34a)]" : "text-[var(--vauto-text-muted)]"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Lock className="h-3.5 w-3.5" aria-hidden />
      )}
      {ok ? okText : missingText}
    </p>
  );
}

/**
 * Locked payment vault: card and IBAN live in Stripe, VAUTO renders only masked
 * tails. Both gates are surfaced here because this is where the user fixes them.
 */
export function PaymentMethodsCard() {
  const { showToast } = useVauto();
  const searchParams = useSearchParams();
  const [summary, setSummary] = useState<PaymentMethodsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Busy>("none");

  const load = useCallback(async () => {
    const res = await apiFetchPaymentMethods();
    if (res.ok && res.data) setSummary(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Returning from Stripe-hosted Checkout / Connect onboarding.
  const paymentParam = searchParams.get("payment");
  const sessionId = searchParams.get("session_id");
  const payoutParam = searchParams.get("payout");

  useEffect(() => {
    if (paymentParam !== "saved" || !sessionId) return;
    void (async () => {
      const res = await apiConfirmPaymentMethodSetup(sessionId);
      showToast(
        res.ok ? "Mokėjimo kortelė išsaugota." : (res.error ?? "Nepavyko išsaugoti kortelės."),
        res.ok ? "success" : "error"
      );
      await load();
    })();
  }, [load, paymentParam, sessionId, showToast]);

  useEffect(() => {
    if (payoutParam !== "done") return;
    void (async () => {
      const res = await apiSyncPayoutStatus();
      if (res.ok && res.data?.payout.status === "verified") {
        showToast("Išmokėjimo metodas patvirtintas.", "success");
      } else if (res.ok) {
        showToast("Stripe dar tikrina jūsų duomenis. Būsena atsinaujins automatiškai.", "info");
      }
      await load();
    })();
  }, [load, payoutParam, showToast]);

  const startCardSetup = async () => {
    setBusy("card");
    const res = await apiCreatePaymentMethodSetup();
    if (res.ok && res.data?.checkoutUrl) {
      window.location.href = res.data.checkoutUrl;
      return;
    }
    setBusy("none");
    showToast(res.ok ? "Nepavyko atidaryti Stripe." : (res.error ?? "Klaida"), "error");
  };

  const startPayoutOnboarding = async () => {
    setBusy("payout");
    const res = await apiCreatePayoutOnboarding();
    if (res.ok && res.data?.onboardingUrl) {
      window.location.href = res.data.onboardingUrl;
      return;
    }
    setBusy("none");
    showToast(res.ok ? "Nepavyko atidaryti Stripe." : (res.error ?? "Klaida"), "error");
  };

  const removeCard = async () => {
    setBusy("remove");
    const res = await apiRemovePaymentMethod();
    setBusy("none");
    if (!res.ok) {
      showToast(res.error ?? "Nepavyko pašalinti kortelės.", "error");
      return;
    }
    showToast("Kortelė pašalinta. Pirkimai bus užblokuoti, kol pridėsite naują.", "info");
    await load();
  };

  const card = summary?.card ?? null;
  const payout = summary?.payout ?? null;
  const stripeOff = summary != null && !summary.stripeConfigured;

  return (
    <Panel
      id="payment-methods"
      icon={<ShieldCheck className="h-4 w-4 text-[var(--vauto-primary)]" />}
      title="Mokėjimo ir išmokėjimo metodai"
      description="Duomenis saugo Stripe. VAUTO mato tik paskutinius keturis simbolius — pilnas kortelės numeris ar IBAN į mūsų serverius nepatenka."
      bodyClassName="space-y-3"
    >
      {loading ? (
        <p className="flex items-center gap-2 text-xs text-[var(--vauto-text-muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Kraunama…
        </p>
      ) : stripeOff ? (
        <p className="flex items-start gap-2 text-xs text-[var(--vauto-text-muted)]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--vauto-red)]" aria-hidden />
          Mokėjimų sistema šiuo metu neprieinama. Pabandykite vėliau.
        </p>
      ) : (
        <>
          <div className="vauto-panel vauto-panel--nested flex items-center gap-3 p-3">
            <span className="vauto-group-row-icon" aria-hidden>
              <CreditCard className="h-4 w-4 text-[var(--vauto-primary)]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--vauto-text-heading)]">
                {card ? `${card.label} ${card.masked}` : "Mokėjimo kortelė nepridėta"}
              </p>
              {card?.expiry ? (
                <p className="text-[11px] text-[var(--vauto-text-muted)]">
                  Galioja iki {card.expiry}
                </p>
              ) : null}
              <StatusLine
                ok={Boolean(card)}
                okText="Pirkimai atidaryti"
                missingText="Be kortelės pirkti negalima"
              />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {card ? (
                <button
                  type="button"
                  onClick={() => void removeCard()}
                  disabled={busy !== "none"}
                  aria-label="Pašalinti kortelę"
                  className="rounded-xl border border-[var(--vauto-border)] p-2 text-[var(--vauto-red)] disabled:opacity-50"
                >
                  {busy === "remove" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  )}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void startCardSetup()}
                disabled={busy !== "none"}
                className="vauto-btn-quiet inline-flex items-center gap-1.5 px-3 py-2 text-xs disabled:opacity-50"
              >
                {busy === "card" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                )}
                {card ? "Keisti" : "Pridėti"}
              </button>
            </div>
          </div>

          <div className="vauto-panel vauto-panel--nested flex items-center gap-3 p-3">
            <span className="vauto-group-row-icon" aria-hidden>
              <Banknote className="h-4 w-4 text-[var(--vauto-primary)]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--vauto-text-heading)]">
                {payout?.masked ?? "Išmokėjimo sąskaita nepridėta"}
              </p>
              {payout?.holderName ? (
                <p className="truncate text-[11px] text-[var(--vauto-text-muted)]">
                  {payout.holderName}
                </p>
              ) : null}
              {payout ? (
                <p
                  className={`text-[11px] font-medium ${
                    STATUS_TONE[payout.status] ?? "text-[var(--vauto-text-muted)]"
                  }`}
                >
                  {payout.statusLabel}
                </p>
              ) : (
                <StatusLine
                  ok={false}
                  okText=""
                  missingText="Be jos negalima skelbti su siuntimu"
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => void startPayoutOnboarding()}
              disabled={busy !== "none"}
              className="vauto-btn-quiet inline-flex shrink-0 items-center gap-1.5 px-3 py-2 text-xs disabled:opacity-50"
            >
              {busy === "payout" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              )}
              {payout ? "Keisti" : "Pridėti"}
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}
