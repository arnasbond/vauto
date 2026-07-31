"use client";

import { MessageCircle, Package, Sparkles, X } from "lucide-react";
import type { Listing } from "@/lib/types";
import { getQuickQuestions } from "@/lib/chat-helpers";
import { listingOffersOmnivaShipping } from "@/lib/logistics-ready";

interface ListingBuyerTipsModalProps {
  listing: Listing;
  onClose: () => void;
  onAsk: (question: string) => void;
}

/**
 * Buyer-facing AI helper — concrete FAQ chips, not hallucinated trust scores.
 */
export function ListingBuyerTipsModal({
  listing,
  onClose,
  onAsk,
}: ListingBuyerTipsModalProps) {
  const questions = getQuickQuestions(listing);
  const omniva = listingOffersOmnivaShipping(listing);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
        role="dialog"
        aria-labelledby="buyer-tips-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--vauto-teal)]/15">
              <Sparkles className="h-5 w-5 text-[var(--vauto-teal)]" />
            </span>
            <div>
              <h2
                id="buyer-tips-title"
                className="text-base font-bold text-[var(--vauto-text)]"
              >
                AI pagalba pirkėjui
              </h2>
              <p className="text-xs text-[var(--vauto-text-muted)] line-clamp-1">
                {listing.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--vauto-text-muted)] hover:bg-slate-100"
            aria-label="Uždaryti"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-3 text-sm text-[var(--vauto-text-muted)]">
          Pasirinkite klausimą — atidarysime pokalbį su pardavėju ir išsiųsime
          žinutę.
        </p>

        <ul className="mb-4 space-y-2">
          {questions.map((q) => (
            <li key={q}>
              <button
                type="button"
                onClick={() => onAsk(q)}
                className="flex w-full items-center gap-2 rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-surface-page,#f8fafc)] px-3 py-2.5 text-left text-sm font-medium text-[var(--vauto-text)] transition hover:border-[var(--vauto-teal)]/40"
              >
                <MessageCircle className="h-4 w-4 shrink-0 text-[var(--vauto-teal)]" />
                {q}
              </button>
            </li>
          ))}
        </ul>

        {omniva ? (
          <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-800">
            <Package className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Šis skelbimas leidžia užsakyti su Omniva paštomatu — mygtukas
            „Užsakyti su siuntimu“ juostoje.
          </p>
        ) : (
          <p className="text-xs text-[var(--vauto-text-muted)]">
            Patarimas: klauskite apie kainą, būklę ir atsiėmimą — tada lengviau
            susitarti.
          </p>
        )}
      </div>
    </div>
  );
}
