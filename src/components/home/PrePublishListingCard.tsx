"use client";

import { useState } from "react";
import { MapPin, Loader2, Phone } from "lucide-react";
import { formatPrice, MOCK_CATEGORY_LABELS } from "@/data/mockListings";
import { cn } from "@/lib/cn";
import {
  getPrePublishVisibilityOption,
  PRE_PUBLISH_VISIBILITY_HEADLINE,
  PRE_PUBLISH_VISIBILITY_OPTIONS,
  type PrePublishVisibilityId,
} from "@/lib/listing-publish-visibility";
import type { PrePublishCardPayload } from "@/lib/pre-publish-validation";
import type { ListingCategory } from "@/lib/types";

export interface PrePublishListingCardProps {
  card: PrePublishCardPayload;
  publishing?: boolean;
  onPublish: (sourceRect: DOMRect, visibilityId: PrePublishVisibilityId) => void;
  /** @deprecated Confirmation stage is forward-only — edit is ignored. */
  onEdit?: () => void;
  className?: string;
}

function categoryLabel(category?: string): string {
  if (!category) return "Skelbimas";
  return MOCK_CATEGORY_LABELS[category as ListingCategory] ?? category;
}

function truncateDescription(text: string, max = 160): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

export function PrePublishListingCard({
  card,
  publishing = false,
  onPublish,
  onEdit,
  className,
}: PrePublishListingCardProps) {
  const [visibilityId, setVisibilityId] =
    useState<PrePublishVisibilityId>("standard");
  const selected = getPrePublishVisibilityOption(visibilityId);

  const handlePublish = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onPublish(rect, visibilityId);
  };

  return (
    <div
      className={cn(
        "pre-publish-listing-card w-full max-w-[min(100%,20.5rem)] overflow-hidden rounded-2xl border border-[var(--vauto-primary)]/20 bg-[var(--vauto-card-bg)] shadow-[0_12px_40px_rgba(15,23,42,0.12)] md:max-w-sm",
        className
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        {card.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.imageUrl}
            alt={card.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-xs text-slate-500">
            Nuotrauka
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
          {categoryLabel(card.category)}
        </span>
        <span className="absolute bottom-2 right-2 rounded-xl bg-[var(--vauto-primary)] px-2.5 py-1 text-sm font-bold text-[var(--vauto-primary-contrast,#fff)] shadow-md">
          {formatPrice(card.price, card.priceLabel ?? card.vatLabelGross)}
        </span>
      </div>
      {(card.imageUrls?.length ?? 0) > 1 ? (
        <div className="flex gap-1.5 overflow-x-auto border-b border-[var(--vauto-border)]/50 bg-[var(--vauto-surface-muted)]/40 px-2.5 py-2">
          {card.imageUrls!.slice(0, 6).map((url, idx) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${url.slice(0, 24)}-${idx}`}
              src={url}
              alt=""
              className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-black/10"
            />
          ))}
        </div>
      ) : null}

      <div className="space-y-2.5 p-3.5">
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-[var(--vauto-text)]">
          {card.title}
        </h3>
        <p className="flex items-center gap-1 text-xs font-medium text-[var(--vauto-text-muted)]">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--vauto-primary)]" aria-hidden />
          {card.location}
        </p>
        {card.description ? (
          <p className="line-clamp-3 text-[12px] leading-relaxed text-[var(--vauto-text-muted)]">
            {truncateDescription(card.description)}
          </p>
        ) : null}
        {card.vatLabelNet && card.vatLabelGross ? (
          <p className="text-[11px] font-medium text-[var(--vauto-text-muted)]">
            {card.vatLabelGross} · {card.vatLabelNet}
          </p>
        ) : null}
        {card.phone ? (
          <p className="flex items-center gap-1.5 border-t border-[var(--vauto-border)]/60 pt-2 text-xs font-semibold text-[var(--vauto-text)]">
            <Phone className="h-3.5 w-3.5 shrink-0 text-[var(--vauto-primary)]" aria-hidden />
            <a
              href={`tel:${card.phone.replace(/\s/g, "")}`}
              className="font-bold text-blue-600 hover:underline"
            >
              {card.phone}
            </a>
          </p>
        ) : null}

        <div className="rounded-xl border border-[var(--vauto-primary)]/15 bg-[var(--vauto-surface-muted)]/30 p-2.5">
          <p className="text-xs font-bold text-[var(--vauto-text)]">
            {PRE_PUBLISH_VISIBILITY_HEADLINE}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--vauto-text-muted)]">
            Paryškinti skelbimą arba iškelti į viršų — pasirinkite prieš publikuojant.
          </p>
          <div className="mt-2 space-y-1.5" role="radiogroup" aria-label="Matomumo planas">
            {PRE_PUBLISH_VISIBILITY_OPTIONS.map((opt) => {
              const active = visibilityId === opt.id;
              return (
                <label
                  key={opt.id}
                  className={cn(
                    "flex cursor-pointer touch-manipulation items-start gap-2.5 rounded-lg border px-2.5 py-2 transition",
                    active
                      ? "border-[var(--vauto-primary)] bg-[var(--vauto-primary)]/8 ring-1 ring-[var(--vauto-primary)]/25"
                      : "border-[var(--vauto-border)]/80 bg-[var(--vauto-card-bg)] hover:border-[var(--vauto-primary)]/30"
                  )}
                >
                  <input
                    type="radio"
                    name="pre-publish-visibility"
                    value={opt.id}
                    checked={active}
                    onChange={() => setVisibilityId(opt.id)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--vauto-primary)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-[var(--vauto-text)]">
                      {opt.label}
                    </span>
                    <span className="block text-[11px] leading-snug text-[var(--vauto-text-muted)]">
                      {opt.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {selected.priceEur > 0 && (
            <p className="mt-2 text-[11px] font-medium text-[var(--vauto-primary)]">
              Pasirinkta: {selected.label} — {selected.priceEur.toFixed(2)} €
            </p>
          )}
        </div>

        <div className="mt-1 flex flex-col gap-2">
          <button
            type="button"
            disabled={publishing}
            onClick={handlePublish}
            className="flex min-h-[48px] w-full touch-manipulation items-center justify-center gap-2 rounded-xl bg-[var(--vauto-primary)] px-4 py-3 text-sm font-bold text-[var(--vauto-primary-contrast,#fff)] shadow-md transition hover:opacity-95 active:scale-[0.99] disabled:opacity-60"
          >
            {publishing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Publikuojama…
              </>
            ) : (
              <>Patvirtinti ir publikuoti</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
