"use client";

import { useState } from "react";
import { Check, Pencil, ShieldCheck, X } from "lucide-react";
import type {
  VinReviewSideEffectPayload,
  VinReviewStructuredAction,
} from "@vauto/shared/vin-review";
import { cn } from "@/lib/cn";

/**
 * Phase 2C — trusted VIN review UI.
 *
 * Displays the exact candidate/conflict values + provenance from the `vin_review`
 * side-effect payload. Buttons emit STRUCTURED actions (bound to the payload's
 * `reviewId`) — chip labels or free text are never authority.
 */
export function VinReviewCard({
  review,
  busy,
  onAction,
  className,
}: {
  review: VinReviewSideEffectPayload;
  busy?: boolean;
  onAction: (action: VinReviewStructuredAction) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState("");

  const emit = (action: VinReviewStructuredAction) => {
    onAction(action);
    setEditing(false);
    setTyped("");
  };

  const confirm = (value: string) =>
    emit({ type: "confirm", value, reviewId: review.reviewId });
  const reject = () => emit({ type: "reject", reviewId: review.reviewId });
  const correct = () => {
    const value = typed.trim().toUpperCase();
    if (value) emit({ type: "correct", value, reviewId: review.reviewId });
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-amber-500/40 bg-amber-500/8 p-3",
        className
      )}
      data-vin-review-card="1"
      role="group"
      aria-label="VIN kodo patvirtinimas"
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <ShieldCheck className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
        <p className="text-[12px] font-bold text-[var(--vauto-text)]">
          VIN patvirtinimas — AI pasiūlė, jūs sprendžiate
        </p>
      </div>

      {review.status === "candidate" && review.candidate ? (
        <div className="space-y-2">
          <p className="text-[12px] leading-snug text-[var(--vauto-text-muted)]">
            Siūlomas VIN:{" "}
            <span className="font-mono text-[13px] font-bold tracking-wide text-[var(--vauto-text)]">
              {review.candidate}
            </span>
            {review.candidateSource ? (
              <span className="ml-1 text-[11px] opacity-80">
                ({review.choices.find((c) => c.value === review.candidate)?.labelLt ?? ""})
              </span>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => confirm(review.candidate!)}
              className="flex items-center gap-1 rounded-lg bg-[var(--vauto-primary)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--vauto-primary-contrast,#fff)] disabled:opacity-60"
            >
              <Check className="h-3.5 w-3.5" aria-hidden />
              Patvirtinti VIN
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing((v) => !v)}
              className="flex items-center gap-1 rounded-lg border border-[var(--vauto-border)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--vauto-text)] disabled:opacity-60"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Įvesti kitą VIN
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={reject}
              className="flex items-center gap-1 rounded-lg border border-[var(--vauto-border)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--vauto-text-muted)] disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Nežinau VIN
            </button>
          </div>
        </div>
      ) : null}

      {review.status === "conflict" ? (
        <div className="space-y-2">
          <p className="text-[12px] leading-snug text-[var(--vauto-text-muted)]">
            Skirtingi šaltiniai rodo skirtingus VIN kodus — pasirinkite teisingą:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {review.choices.map((choice) => (
              <button
                key={`${choice.value}-${choice.source ?? "src"}`}
                type="button"
                disabled={busy}
                onClick={() => confirm(choice.value)}
                className="rounded-lg border border-amber-500/50 bg-[var(--vauto-card-bg)] px-2.5 py-1.5 text-left text-[12px] font-semibold text-[var(--vauto-text)] disabled:opacity-60"
              >
                <span className="block font-mono text-[12px] font-bold tracking-wide">
                  {choice.value}
                </span>
                <span className="block text-[10px] font-normal text-[var(--vauto-text-muted)]">
                  {choice.labelLt}
                </span>
              </button>
            ))}
            <button
              type="button"
              disabled={busy}
              onClick={reject}
              className="flex items-center gap-1 rounded-lg border border-[var(--vauto-border)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--vauto-text-muted)] disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Nežinau VIN
            </button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            type="text"
            value={typed}
            autoFocus
            maxLength={17}
            placeholder="VIN kodas (17 simbolių)"
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") correct();
            }}
            className="min-w-0 flex-1 rounded-lg border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] px-2.5 py-1.5 font-mono text-[12px] uppercase tracking-wide text-[var(--vauto-text)] outline-none focus:border-[var(--vauto-primary)]"
          />
          <button
            type="button"
            disabled={busy || !typed.trim()}
            onClick={correct}
            className="rounded-lg bg-[var(--vauto-primary)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--vauto-primary-contrast,#fff)] disabled:opacity-60"
          >
            Pateikti
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(false)}
            className="rounded-lg border border-[var(--vauto-border)] px-2 py-1.5 text-[12px] text-[var(--vauto-text-muted)]"
            aria-label="Atšaukti"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
}
