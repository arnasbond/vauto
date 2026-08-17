"use client";

import { useId, useState } from "react";
import { Button, Card } from "@/design-system";
import {
  formatDealCentsLt,
  parseEuroInputToCents,
} from "@vauto/shared/marketplace-domain/deal-actions";
import { dealStatusLabel } from "@/lib/deal-status";
import type { UniversalDealPayload } from "@/lib/api/deal-room";

function roleLabel(role: "BUYER" | "SELLER") {
  return role === "BUYER" ? "Pirkėjas" : "Pardavėjas";
}

function turnCopy(room: UniversalDealPayload): string {
  if (room.turn === "NONE") {
    if (room.dealState === "ACCEPTED") {
      return "Pasiūlymas priimtas. Tolesnius žingsnius valdo serveris.";
    }
    if (room.dealState === "CANCELLED") return "Sandoris atšauktas.";
    return "Šiuo metu veiksmo nėra.";
  }
  if (room.turn === room.viewerRole) return "Dabar jūsų eilė.";
  return room.turn === "BUYER" ? "Laukiama pirkėjo veiksmo." : "Laukiama pardavėjo veiksmo.";
}

export function UniversalDealRoomPanel(props: {
  room: UniversalDealPayload;
  busy: boolean;
  onCounter: (amountCents: number) => Promise<void>;
  onReject: () => Promise<void>;
}) {
  const { room, busy } = props;
  const counterId = useId();
  const [counterEuro, setCounterEuro] = useState("");
  const [announce, setAnnounce] = useState(turnCopy(room));
  const actions = new Set(room.viewerDealActions);
  const canCounter = actions.has("COUNTER_OFFER") && Boolean(room.activeOffer);
  const canReject = actions.has("REJECT") && Boolean(room.activeOffer);

  return (
    <div className="space-y-4 overflow-x-hidden" data-universal-deal-room>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      <Card>
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--ds-brand)]">
          Derybos
        </p>
        <p className="mt-2 text-sm" data-deal-turn>
          {turnCopy(room)}
        </p>
        <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
          Derybų būsena: {dealStatusLabel(room.dealState)}
        </p>
        {room.fulfillment.pickup ? (
          <p className="mt-2 text-xs text-[var(--ds-text-muted)]">Galimas atsiėmimas.</p>
        ) : null}
        {room.fulfillment.appointments ? (
          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">Galima sutarti susitikimą.</p>
        ) : null}
        {room.capabilities.supportsApplications && !room.capabilities.supportsOffers ? (
          <p className="mt-2 text-sm" data-jobs-contact>
            Tai ne pirkimo sandoris. Galite susisiekti ir teikti kandidatūrą — platforma
            neatlieka atlyginimo mokėjimo.
          </p>
        ) : null}
      </Card>

      {room.history.length > 0 ? (
        <Card>
          <h3 className="text-sm font-bold">Kas pasiūlė</h3>
          <ol className="mt-2 space-y-2" data-deal-history>
            {room.history.map((item) => (
              <li key={item.id} className="text-sm" data-offer-id={item.id}>
                <span className="font-semibold">{roleLabel(item.createdByRole)}</span>
                {" · "}
                {formatDealCentsLt(item.amountCents)}
                {" · "}
                <span className="text-[var(--ds-text-muted)]">{dealStatusLabel(item.status)}</span>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {canCounter ? (
        <Card>
          <h3 className="text-sm font-bold">Priešpasiūlymas</h3>
          <label htmlFor={counterId} className="mt-2 block text-xs font-semibold">
            Nauja suma (€)
          </label>
          <input
            id={counterId}
            inputMode="decimal"
            value={counterEuro}
            onChange={(e) => setCounterEuro(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-3 text-base"
            data-counter-amount
          />
          <Button
            className="mt-3 min-h-12 w-full sm:w-auto"
            disabled={busy}
            data-submit-counter
            onClick={() => {
              const cents = parseEuroInputToCents(counterEuro);
              if (cents == null) {
                setAnnounce("Įveskite teisingą priešpasiūlymo sumą.");
                return;
              }
              void props.onCounter(cents).then(() => {
                setCounterEuro("");
                setAnnounce("Priešpasiūlymas pateiktas.");
              });
            }}
          >
            Siųsti priešpasiūlymą
          </Button>
        </Card>
      ) : null}

      {canReject ? (
        <Button
          variant="secondary"
          className="min-h-12 w-full sm:w-auto"
          disabled={busy}
          data-reject-offer
          onClick={() =>
            void props.onReject().then(() => setAnnounce("Pasiūlymas atmestas."))
          }
        >
          Atmesti pasiūlymą
        </Button>
      ) : null}
    </div>
  );
}
