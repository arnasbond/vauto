"use client";

import { useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import type { Listing } from "@/lib/types";
import { adviseListingOptimization } from "@/lib/listing-ai-advisor";

interface AiListingAdvisorModalProps {
  listing: Listing | null;
  onClose: () => void;
}

export function AiListingAdvisorModal({ listing, onClose }: AiListingAdvisorModalProps) {
  const [advice, setAdvice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAdvice = async () => {
    if (!listing) return;
    setLoading(true);
    setError(null);
    try {
      const text = await adviseListingOptimization(listing);
      setAdvice(text);
    } catch {
      setError("Nepavyko gauti AI patarimo. Bandykite vėliau.");
    } finally {
      setLoading(false);
    }
  };

  if (!listing) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div
        className="vauto-dashboard-card w-full max-w-md rounded-2xl p-5 shadow-xl"
        role="dialog"
        aria-labelledby="ai-advisor-title"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--vauto-teal)]/15">
              <Sparkles className="h-5 w-5 text-[var(--vauto-teal)]" />
            </span>
            <div>
              <h2 id="ai-advisor-title" className="text-base font-bold text-[var(--vauto-text)]">
                AI ekspertas
              </h2>
              <p className="text-xs text-[var(--vauto-text-muted)] line-clamp-1">{listing.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--vauto-text-muted)] hover:bg-[var(--vauto-surface-muted)]"
            aria-label="Uždaryti"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!advice && !loading && (
          <p className="mb-4 text-sm text-[var(--vauto-text-muted)]">
            Gemini išanalizuos kainą, aprašymą ir giliuosius atributus bei pasiūlys, kaip
            pagerinti pardavimus.
          </p>
        )}

        {loading && (
          <div className="flex items-center gap-2 py-6 text-sm text-[var(--vauto-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analizuojama…
          </div>
        )}

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {advice && (
          <div className="mb-4 rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-surface-muted)] p-3 text-sm leading-relaxed text-[var(--vauto-text)]">
            {advice}
          </div>
        )}

        <div className="flex gap-2">
          {!advice && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void runAdvice()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--vauto-teal)] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              Gauti patarimą
            </button>
          )}
          {advice && (
            <button
              type="button"
              onClick={() => void runAdvice()}
              disabled={loading}
              className="flex-1 rounded-xl border border-[var(--vauto-border)] py-2.5 text-sm font-medium text-[var(--vauto-text)]"
            >
              Atnaujinti
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--vauto-border)] px-4 py-2.5 text-sm text-[var(--vauto-text-muted)]"
          >
            Uždaryti
          </button>
        </div>
      </div>
    </div>
  );
}
