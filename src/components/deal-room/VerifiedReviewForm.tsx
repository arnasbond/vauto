"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/design-system";
import { apiSubmitVerifiedReview } from "@/lib/api/deal-room";
import { cn } from "@/lib/cn";

export function VerifiedReviewForm({
  transactionId,
  alreadySubmitted,
  onSubmitted,
}: {
  transactionId: string;
  alreadySubmitted: boolean;
  onSubmitted: () => void;
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(alreadySubmitted);
  const disabled = done || busy;

  async function submit() {
    if (disabled) return;
    setBusy(true);
    setError(null);
    const res = await apiSubmitVerifiedReview(transactionId, {
      rating,
      comment: comment.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      if (res.error.status === 409) {
        setDone(true);
        setError("Jūs jau įvertinote šį sandorį");
        return;
      }
      setError(res.error.message);
      return;
    }
    setDone(true);
    onSubmitted();
  }

  return (
    <section
      className="rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] p-4"
      data-verified-review-form
    >
      <h2 className="text-sm font-bold text-[var(--ds-text-primary)]">
        Patvirtintas atsiliepimas
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-[var(--ds-text-muted)]">
        Atsiliepimas siejamas tik su realiai įvykusiu užbaigtu (COMPLETED)
        sandoriu. VAUTO nustato, ką vertinate — jūs siunčiate tik įvertinimą ir
        komentarą.
      </p>
      <fieldset className="mt-3" disabled={disabled}>
        <legend className="mb-1 text-xs font-semibold text-[var(--ds-text-secondary)]">
          Įvertinimas
        </legend>
        <div className="flex gap-1" role="radiogroup" aria-label="Įvertinimas žvaigždutėmis">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} iš 5`}
              aria-pressed={rating === n}
              onClick={() => setRating(n)}
              className="rounded-lg p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-brand)]"
            >
              <Star
                className={cn(
                  "h-6 w-6",
                  n <= rating
                    ? "fill-amber-400 text-amber-400"
                    : "text-[var(--ds-border-strong)]"
                )}
              />
            </button>
          ))}
        </div>
        <label className="mt-3 block text-xs font-semibold text-[var(--ds-text-secondary)]" htmlFor="verified-review-comment">
          Komentaras
        </label>
        <textarea
          id="verified-review-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={4000}
          rows={3}
          className="mt-1 w-full rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-muted)] px-3 py-2 text-sm"
          placeholder="Trumpai aprašykite patirtį (neprivaloma)"
        />
      </fieldset>
      {error ? (
        <p className="mt-2 text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {done && !error ? (
        <p className="mt-2 text-xs font-medium text-[var(--ds-success)]">
          Ačiū. Atsiliepimas išsaugotas.
        </p>
      ) : null}
      <Button
        variant="primary"
        className="mt-3"
        disabled={disabled}
        onClick={() => void submit()}
        data-submit-verified-review
      >
        {busy ? "Siunčiama…" : done ? "Jau įvertinote" : "Pateikti atsiliepimą"}
      </Button>
    </section>
  );
}
