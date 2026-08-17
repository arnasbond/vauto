"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button, Card } from "@/design-system";
import { useVauto } from "@/context/VautoContext";
import { DealStatusStepper } from "@/components/deal-room/DealStatusStepper";
import { VerifiedReviewForm } from "@/components/deal-room/VerifiedReviewForm";
import { VerifiedReputationBadge } from "@/components/reputation/VerifiedReputationBadge";
import {
  apiAcceptOffer,
  apiCompleteTransaction,
  apiConfirmDelivery,
  apiCreateOmnivaLabel,
  apiCreateOffer,
  apiCreatePaymentIntent,
  apiCreateStripeIntent,
  apiCounterOffer,
  apiGetDealRoom,
  apiGetDispute,
  apiGetTracking,
  apiGetUniversalDeal,
  apiListMyTransactions,
  apiListTransactionReviews,
  apiOpenDispute,
  apiRejectOffer,
  apiStartListingDeal,
  apiSyncCarrier,
  type DealRoomPayload,
  type DeliveryPayload,
  type DisputePayload,
  type ReviewRow,
  type UniversalDealPayload,
} from "@/lib/api/deal-room";
import { UniversalDealRoomPanel } from "@/components/deal-room/UniversalDealRoomPanel";
import {
  dealStatusHint,
  dealStatusLabel,
  formatCentsEur,
  carrierStatusHint,
} from "@/lib/deal-status";

const DISPUTE_REASONS = [
  { id: "ITEM_NOT_RECEIVED", label: "Negavau prekės" },
  { id: "DAMAGED", label: "Prekė pažeista" },
  { id: "NOT_AS_DESCRIBED", label: "Neatitinka aprašymo" },
  { id: "OTHER", label: "Kita" },
] as const;

function DealList({
  onOpen,
}: {
  onOpen: (id: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<
    Array<{
      id: string;
      status: string;
      viewerRole: "BUYER" | "SELLER";
      listingId: string;
    }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    void apiListMyTransactions().then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setItems(res.data.transactions);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="py-10 text-center text-sm text-[var(--ds-text-muted)]">Kraunama sandorių sąrašas…</p>;
  }
  if (error) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
        {error}
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-[var(--ds-border-subtle)] px-4 py-10 text-center text-sm text-[var(--ds-text-muted)]">
        Aktyvių sandorių nėra. Pradėkite sandorį iš skelbimo puslapio — VAUTO padės
        pereiti eigą, o galutinį sprendimą priimate jūs.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((tx) => (
        <li key={tx.id}>
          <button
            type="button"
            onClick={() => onOpen(tx.id)}
            className="flex w-full items-center justify-between rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] px-4 py-3 text-left hover:border-[var(--ds-brand)]/40"
            data-deal-list-item={tx.id}
          >
            <span className="text-sm font-semibold">
              {tx.viewerRole === "BUYER" ? "Pirkimas" : "Pardavimas"}
            </span>
            <span className="text-xs font-medium text-[var(--ds-text-muted)]">
              {dealStatusLabel(tx.status)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function DealRoomBody({ transactionId }: { transactionId: string }) {
  const { openAuthModal, user } = useVauto();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<DealRoomPayload | null>(null);
  const [universal, setUniversal] = useState<UniversalDealPayload | null>(null);
  const [tracking, setTracking] = useState<DeliveryPayload["delivery"] | null>(null);
  const [dispute, setDispute] = useState<DisputePayload["dispute"] | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState<(typeof DISPUTE_REASONS)[number]["id"]>("NOT_AS_DESCRIBED");
  const [disputeText, setDisputeText] = useState("");
  const [trackCode, setTrackCode] = useState("");
  const [terminalId, setTerminalId] = useState("");
  const [offerCents, setOfferCents] = useState("");
  const disputePanelRef = useRef<HTMLDivElement>(null);
  const helpPanelRef = useRef<HTMLDivElement>(null);
  const helpOpenerRef = useRef<HTMLButtonElement>(null);

  const reload = useCallback(async () => {
    const roomRes = await apiGetDealRoom(transactionId);
    if (!roomRes.ok) {
      setError(roomRes.error.message);
      if (roomRes.error.kind === "unauthorized") openAuthModal("/sandoriai/");
      setLoading(false);
      return;
    }
    setRoom(roomRes.data);
    const uni = await apiGetUniversalDeal(transactionId);
    setUniversal(uni.ok ? uni.data : null);
    setError(null);
    const [tr, ds, rv] = await Promise.all([
      apiGetTracking(transactionId),
      apiGetDispute(transactionId),
      apiListTransactionReviews(transactionId),
    ]);
    setTracking(tr.ok ? tr.data.delivery : null);
    setDispute(ds.ok ? ds.data.dispute : null);
    setReviews(rv.ok ? rv.data.reviews : []);
    setLoading(false);
  }, [transactionId, openAuthModal]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useLayoutEffect(() => {
    const open = disputeOpen || helpOpen;
    const root = disputeOpen ? disputePanelRef.current : helpPanelRef.current;
    const opener = disputeOpen
      ? document.querySelector<HTMLElement>("[data-open-dispute]")
      : helpOpenerRef.current;
    if (!open || !root) return;
    const focusables = root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const list = Array.from(focusables);
    list[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (disputeOpen) setDisputeOpen(false);
        if (helpOpen) setHelpOpen(false);
        return;
      }
      if (e.key !== "Tab" || list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [disputeOpen, helpOpen]);

  const state = room?.transaction.state ?? "";
  const role = room?.viewerRole ?? "BUYER";
  const myReview = reviews.find((r) => r.reviewerId === user.id);
  const canConfirm = role === "BUYER" && state === "SHIPPED";
  const canDispute = (state === "SHIPPED" || state === "DELIVERED") && !dispute;
  const canReview = state === "COMPLETED";
  const canPay =
    role === "BUYER" &&
    (state === "AGREED" || state === "PAYMENT_PENDING") &&
    (universal ? universal.capabilities.supportsPlatformPayment : true);
  const canLabel =
    role === "SELLER" &&
    state === "PAID" &&
    (universal ? universal.capabilities.supportsShipping : true);
  const canOffer = universal
    ? universal.viewerDealActions.includes("OFFER")
    : Boolean(room?.allowedActions.includes("CREATE_OFFER"));
  const canAccept = universal
    ? universal.viewerDealActions.includes("ACCEPT") && Boolean(universal.activeOffer)
    : Boolean(room?.allowedActions.includes("ACCEPT_OFFER") && room?.activeOffer);
  const canComplete = state === "DELIVERED";

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await fn();
      await reload();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="py-12 text-center text-sm text-[var(--ds-text-muted)]">Kraunamas sandorio kambarys…</p>;
  }
  if (error && !room) {
    return (
      <Card>
        <p className="text-sm text-red-700" role="alert">{error}</p>
        <p className="mt-2 text-xs text-[var(--ds-text-muted)]">
          Jei nesate šio sandorio šalis, kambarys nerodomas.
        </p>
      </Card>
    );
  }
  if (!room) return null;

  const amount = room.agreementSnapshot?.amountCents ?? room.activeOffer?.amountCents ?? room.listing.askingPriceCents;

  return (
    <div className="space-y-4 overflow-x-hidden" data-deal-room data-deal-state={state} data-deal-role={role}>
      <Card>
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--ds-brand)]">
          {role === "BUYER" ? "Pirkėjo kambarys" : "Pardavėjo kambarys"}
        </p>
        <h1 className="mt-1 text-lg font-bold">{room.listing.title}</h1>
        <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
          Suma: {formatCentsEur(amount)} · Būseną nustato tik serveris
        </p>
        <p
          className="mt-2 text-xs leading-relaxed text-[var(--ds-text-muted)]"
          data-escrow-hint
        >
          Mokėjimas laikomas VAUTO eigoje, kol patvirtinate gavimą arba
          sprendžiamas ginčas. Tai nėra visų rizikų draudimas.
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          <span>
            Pardavėjas: {room.seller.displayName}{" "}
            <VerifiedReputationBadge userId={room.seller.userId} compact />
          </span>
          <span>
            Pirkėjas: {room.buyer.displayName}{" "}
            <VerifiedReputationBadge userId={room.buyer.userId} compact />
          </span>
        </div>
        <p
          className="mt-2 text-xs leading-relaxed text-[var(--ds-text-muted)]"
          data-verified-review-hint
        >
          Patvirtintas atsiliepimas po sandorio — ne vieši komentarai be pirkimo.
        </p>
        <p className="mt-3 text-sm font-semibold">{dealStatusLabel(state)}</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--ds-text-muted)]">
          {dealStatusHint(state, role)}
        </p>
        <div className="mt-4">
          <DealStatusStepper status={state} />
        </div>
        <button
          ref={helpOpenerRef}
          type="button"
          data-open-deal-help
          className="mt-3 text-xs font-semibold text-[var(--ds-brand)] underline underline-offset-2"
          onClick={() => {
            setHelpOpen(true);
            setDisputeOpen(false);
          }}
        >
          Kas yra sandorio kambarys?
        </button>
      </Card>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      {universal ? (
        <UniversalDealRoomPanel
          room={universal}
          busy={busy}
          onCounter={(amountCents) =>
            run(async () => {
              if (!universal.activeOffer) return;
              const res = await apiCounterOffer(universal.activeOffer.id, {
                amountCents,
                expectedVersion: universal.activeOffer.version,
              });
              if (!res.ok) setError(res.error.message);
              else setNotice("Priešpasiūlymas pateiktas.");
            })
          }
          onReject={() =>
            run(async () => {
              if (!universal.activeOffer) return;
              const res = await apiRejectOffer(
                universal.activeOffer.id,
                universal.activeOffer.version
              );
              if (!res.ok) setError(res.error.message);
              else setNotice("Pasiūlymas atmestas.");
            })
          }
        />
      ) : null}

      {canOffer ? (
        <Card>
          <h2 className="text-sm font-bold">Pasiūlymas</h2>
          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
            Sumą siunčiate centais; šalis ir būseną nustato serveris.
          </p>
          <label htmlFor="offer-cents" className="mt-2 block text-xs font-semibold">
            Suma (centais)
          </label>
          <input
            id="offer-cents"
            inputMode="numeric"
            value={offerCents}
            onChange={(e) => setOfferCents(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            placeholder={String(room.listing.askingPriceCents ?? "")}
          />
          <Button
            className="mt-3 min-h-12 w-full sm:w-auto"
            disabled={busy}
            data-submit-offer
            onClick={() =>
              void run(async () => {
                const cents = Number(offerCents || room.listing.askingPriceCents || 0);
                const res = await apiCreateOffer(transactionId, cents);
                if (!res.ok) setError(res.error.message);
                else setNotice("Pasiūlymas pateiktas.");
              })
            }
          >
            Pateikti pasiūlymą
          </Button>
        </Card>
      ) : null}

      {canAccept && room.activeOffer ? (
        <Card>
          <h2 className="text-sm font-bold">Priimti pasiūlymą</h2>
          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
            {formatCentsEur(room.activeOffer.amountCents)}. Priėmimas keičia būseną serveryje.
          </p>
          <Button
            className="mt-3"
            disabled={busy}
            data-accept-offer
            onClick={() =>
              void run(async () => {
                const res = await apiAcceptOffer(
                  room.activeOffer!.id,
                  room.activeOffer!.version
                );
                if (!res.ok) setError(res.error.message);
                else setNotice("Pasiūlymas priimtas.");
              })
            }
          >
            Priimti pasiūlymą
          </Button>
        </Card>
      ) : null}

      {canPay ? (
        <Card>
          <h2 className="text-sm font-bold">Mokėjimas</h2>
          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
            Sumą ir valiutą paima serveris iš sutarties. Lėšos laikomos, kol
            patvirtinate gavimą arba sprendžiamas ginčas. Naršyklė negali
            pažymėti sandorio kaip apmokėto — tai padaro Stripe webhook.
          </p>
          <Button
            className="mt-3"
            disabled={busy}
            data-start-payment
            onClick={() =>
              void run(async () => {
                const ledger = await apiCreatePaymentIntent(transactionId);
                if (!ledger.ok) {
                  setError(ledger.error.message);
                  return;
                }
                const stripe = await apiCreateStripeIntent(transactionId);
                if (!stripe.ok) {
                  setError(stripe.error.message);
                  return;
                }
                setNotice(
                  `Mokėjimas paruoštas (${formatCentsEur(stripe.data.amountCents)}). Laukiama banko patvirtinimo.`
                );
              })
            }
          >
            Apmokėti saugiai
          </Button>
        </Card>
      ) : null}

      {canLabel ? (
        <Card>
          <h2 className="text-sm font-bold">Omniva siuntos lipdukas</h2>
          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
            Lipdukas kuriamas serveryje. Jei turite sekimo kodą, įrašykite; kitaip jį
            sugeneruos vežėjo adapteris.
          </p>
          <label htmlFor="omniva-track" className="mt-2 block text-xs font-semibold">
            Sekimo kodas
          </label>
          <input
            id="omniva-track"
            value={trackCode}
            onChange={(e) => setTrackCode(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            minLength={4}
          />
          <label htmlFor="omniva-term" className="mt-2 block text-xs font-semibold">
            Terminalas
          </label>
          <input
            id="omniva-term"
            value={terminalId}
            onChange={(e) => setTerminalId(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
          />
          <Button
            className="mt-3"
            disabled={busy}
            data-create-label
            onClick={() =>
              void run(async () => {
                const res = await apiCreateOmnivaLabel(transactionId, {
                  trackingCode: trackCode.trim() || undefined,
                  terminalId: terminalId.trim() || undefined,
                });
                if (!res.ok) setError(res.error.message);
                else setNotice(res.data.messageLt || "Siuntos lipdukas sukurtas.");
              })
            }
          >
            Sukurti lipduką
          </Button>
        </Card>
      ) : null}

      {tracking ? (
        <Card data-omniva-tracking>
          <h2 className="text-sm font-bold">Omniva sekimas</h2>
          <p className="mt-2 font-mono text-sm">{tracking.trackingCode}</p>
          <p
            className="mt-1 text-xs text-[var(--ds-text-muted)]"
            data-omniva-hint
          >
            {carrierStatusHint(tracking.status)}
          </p>
          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
            Statusas: {tracking.status}
            {tracking.terminalId ? ` · Terminalas: ${tracking.terminalId}` : ""}
          </p>
          {tracking.trackingUrl ? (
            <a className="mt-2 inline-block text-xs text-[var(--ds-brand)] underline" href={tracking.trackingUrl}>
              Atidaryti vežėjo nuorodą
            </a>
          ) : null}
          <Button
            variant="secondary"
            className="mt-3"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const res = await apiSyncCarrier(transactionId);
                if (!res.ok) setError(res.error.message);
                else setNotice("Būsena atnaujinta pagal vežėjo duomenis.");
              })
            }
          >
            Atnaujinti pagal vežėją
          </Button>
        </Card>
      ) : null}

      {canConfirm ? (
        <Card>
          <h2 className="text-sm font-bold">Patvirtinti gavimą</h2>
          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
            Mygtukas aktyvus tik būsenoje „Išsiųsta“. Patvirtinimas eina į serverį.
          </p>
          <Button
            className="mt-3"
            disabled={busy}
            data-confirm-delivery
            onClick={() =>
              void run(async () => {
                const conf = await apiConfirmDelivery(transactionId);
                if (!conf.ok) {
                  setError(conf.error.message);
                  return;
                }
                const fin = await apiCompleteTransaction(transactionId);
                if (!fin.ok) {
                  setNotice(
                    conf.data.messageLt ||
                      "Gavimas patvirtintas. Sandoris užbaigiamas, kai serveris patvirtina lėšas."
                  );
                  return;
                }
                setNotice("Gavimas patvirtintas. Sandoris užbaigtas.");
              })
            }
          >
            Patvirtinti gavimą
          </Button>
        </Card>
      ) : null}

      {canComplete ? (
        <Card>
          <h2 className="text-sm font-bold">Užbaigti sandorį</h2>
          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
            Užbaigimas galimas tik po gavimo patvirtinimo ir lėšų pervedimo
            serveryje. Tai ne AI sprendimas.
          </p>
          <Button
            className="mt-3"
            disabled={busy}
            data-complete-deal
            onClick={() =>
              void run(async () => {
                const res = await apiCompleteTransaction(transactionId);
                if (!res.ok) setError(res.error.message);
                else setNotice("Sandoris užbaigtas.");
              })
            }
          >
            Užbaigti sandorį
          </Button>
        </Card>
      ) : null}

      {canDispute ? (
        <Card>
          <h2 className="text-sm font-bold">Ginčas</h2>
          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
            Ginčą galima kelti tik išsiuntus arba pristačius. Sprendimą priima VAUTO.
          </p>
          <Button
            variant="secondary"
            className="mt-3"
            data-open-dispute
            onClick={() => {
              setDisputeOpen(true);
              setHelpOpen(false);
            }}
          >
            Kelti ginčą
          </Button>
        </Card>
      ) : null}

      {dispute ? (
        <Card data-dispute-status>
          <h2 className="text-sm font-bold">Ginčo būsena</h2>
          <p className="mt-1 text-sm">{dispute.status}</p>
          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">{dispute.reason}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{dispute.description}</p>
          {dispute.evidenceJson ? (
            <dl className="mt-3 space-y-1 text-xs text-[var(--ds-text-muted)]">
              <div>Sekimas: {dispute.evidenceJson.trackingCode ?? "—"}</div>
              <div>Įrodymų santrauka: {dispute.evidenceJson.evidenceManifestHash ?? "—"}</div>
              <div>Lėšų būsena: {dispute.evidenceJson.fundsFreezeState}</div>
            </dl>
          ) : null}
        </Card>
      ) : null}

      {canReview ? (
        <VerifiedReviewForm
          transactionId={transactionId}
          alreadySubmitted={Boolean(myReview)}
          onSubmitted={() => void reload()}
        />
      ) : null}

      {reviews.length > 0 ? (
        <Card>
          <h2 className="text-sm font-bold">Šio sandorio atsiliepimai</h2>
          <ul className="mt-2 space-y-2">
            {reviews.map((r) => (
              <li key={r.id} className="text-sm">
                <span className="font-semibold">{r.rating}/5</span>
                {r.comment ? (
                  <p className="mt-0.5 whitespace-pre-wrap text-[var(--ds-text-muted)]">
                    {r.comment}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {disputeOpen ? (
        <div
          ref={disputePanelRef}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dispute-title"
          data-deal-modal="dispute"
        >
          <div className="w-full max-w-md rounded-2xl bg-[var(--ds-surface-card)] p-5">
            <h2 id="dispute-title" className="text-lg font-bold">
              Kelti ginčą
            </h2>
            <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
              Aprašykite situaciją. VAUTO naudos sandorio, pokalbio ir siuntos įrodymus.
            </p>
            <label htmlFor="dispute-reason" className="mt-3 block text-xs font-semibold">
              Priežastis
            </label>
            <select
              id="dispute-reason"
              value={disputeReason}
              onChange={(e) =>
                setDisputeReason(e.target.value as (typeof DISPUTE_REASONS)[number]["id"])
              }
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            >
              {DISPUTE_REASONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <label htmlFor="dispute-text" className="mt-3 block text-xs font-semibold">
              Aprašymas
            </label>
            <textarea
              id="dispute-text"
              value={disputeText}
              onChange={(e) => setDisputeText(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            />
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" onClick={() => setDisputeOpen(false)}>
                Atšaukti
              </Button>
              <Button
                disabled={busy || disputeText.trim().length < 1}
                onClick={() =>
                  void run(async () => {
                    const res = await apiOpenDispute(transactionId, {
                      reason: disputeReason,
                      description: disputeText.trim(),
                    });
                    if (!res.ok) setError(res.error.message);
                    else {
                      setNotice("Ginčas pateiktas.");
                      setDisputeOpen(false);
                    }
                  })
                }
              >
                Pateikti
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {helpOpen ? (
        <div
          ref={helpPanelRef}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deal-help-title"
          data-deal-help-dialog
        >
          <div className="w-full max-w-md rounded-2xl bg-[var(--ds-surface-card)] p-5">
            <h2 id="deal-help-title" className="text-lg font-bold">
              Sandorio kambarys
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ds-text-muted)]">
              AI padeda. Žmogus sprendžia. Pasiūlymą, mokėjimą, siuntą ir gavimą
              tvirtinate jūs. Būsenas (PAID, SHIPPED, COMPLETED) saugo tik serveris.
            </p>
            <Button
              className="mt-4"
              data-close-deal-help
              onClick={() => setHelpOpen(false)}
            >
              Supratau
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DealRoomPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { isAuthenticated, authHydrated, openAuthModal } = useVauto();
  const id = params.get("id");
  const listingId = params.get("listingId");
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    if (!authHydrated) return;
    if (!isAuthenticated) {
      openAuthModal("/sandoriai/");
    }
  }, [authHydrated, isAuthenticated, openAuthModal]);

  useEffect(() => {
    if (!listingId || id || !isAuthenticated) return;
    let cancelled = false;
    void (async () => {
      const started = await apiStartListingDeal(listingId);
      if (cancelled) return;
      if (!started.ok) {
        setBootError(started.error.message);
        return;
      }
      const txId = started.data.transaction.id;
      router.replace(`/sandoriai/?id=${encodeURIComponent(txId)}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId, id, isAuthenticated, router]);

  return (
    <AppShell variant="plain">
      <div className="mx-auto w-full max-w-2xl overflow-x-hidden px-4 py-4 pb-24">
        <Link
          href={id ? "/sandoriai/" : "/"}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--ds-text-muted)]"
        >
          <ArrowLeft className="h-4 w-4" />
          {id ? "Visi sandoriai" : "Atgal"}
        </Link>
        {bootError ? (
          <p className="mb-4 text-sm text-red-700" role="alert">{bootError}</p>
        ) : null}
        {id ? (
          <DealRoomBody transactionId={id} />
        ) : (
          <>
            <h1 className="mb-1 text-xl font-bold">Sandoriai</h1>
            <p className="mb-4 text-sm text-[var(--ds-text-muted)]">
              AI padeda pereiti eigą. Būsenas, mokėjimą ir užbaigimą tvirtina tik
              serveris.
            </p>
            <DealList
              onOpen={(txId) => router.push(`/sandoriai/?id=${encodeURIComponent(txId)}`)}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
