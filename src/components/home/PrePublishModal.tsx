"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  GripVertical,
  Loader2,
  MapPin,
  Phone,
  Plus,
  SendHorizontal,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  ListingGalleryFileInput,
  readGalleryFilesAsDataUrls,
} from "@/components/listing/ListingGalleryFileInput";
import {
  getDynamicAttributeEntries,
  humanizeAttributeKey,
} from "@/lib/listing-dynamic-attributes";
import {
  getPrePublishVisibilityOption,
  PRE_PUBLISH_VISIBILITY_OPTIONS,
  type PrePublishVisibilityId,
} from "@/lib/listing-publish-visibility";
import type { PrePublishCardPayload } from "@/lib/pre-publish-validation";
import type { ListingCategory } from "@/lib/types";
import {
  PrePublishShippingOptions,
  type PrePublishShippingMode,
} from "@/components/home/PrePublishShippingOptions";
import {
  resolveOmnivaLockerEligibility,
} from "@vauto/shared/omniva-locker-eligibility";
import {
  isLaunchPromoActive,
  LAUNCH_PROMO_BADGE,
} from "@vauto/shared/launch-promo";
import { listingCategoryAllowsPhotoless } from "@vauto/shared/listing-photo-policy";

/** Full card → fold → plane flight before API publish. */
const CARD_FOLD_PLANE_MS = 1200;

const TIER_BADGE: Record<
  PrePublishVisibilityId,
  { badge: string; subtitle: string }
> = {
  standard: { badge: "Free", subtitle: "Nemokamas įkėlimas" },
  popular: { badge: "Boost", subtitle: "Iškelti į viršų" },
  maximum: { badge: "Premium", subtitle: "Maksimalus matomumas" },
};

export interface PrePublishFieldPatch {
  title?: string;
  price?: number;
  description?: string;
  category?: ListingCategory;
  location?: string;
  attributes?: Record<string, string>;
  /** Omniva locker opt-in when eligible. */
  allowPastomatas?: boolean;
}

export interface PrePublishModalProps {
  open: boolean;
  card: PrePublishCardPayload;
  publishing?: boolean;
  /** Live draft attributes for editable specs. */
  attributes?: Record<string, string | string[] | undefined>;
  onClose?: () => void;
  onPublish: (sourceRect: DOMRect, visibilityId: PrePublishVisibilityId) => void | Promise<void>;
  onGalleryChange?: (imageUrls: string[]) => void;
  onFieldsChange?: (patch: PrePublishFieldPatch) => void;
}

function attrValue(
  attrs: Record<string, string | string[] | undefined> | undefined,
  key: string
): string {
  if (!attrs) return "";
  const raw = attrs[key];
  if (Array.isArray(raw)) return raw.map(String).join(", ");
  return String(raw ?? "").trim();
}

export function PrePublishModal({
  open,
  card,
  publishing = false,
  attributes,
  onClose,
  onPublish,
  onGalleryChange,
  onFieldsChange,
}: PrePublishModalProps) {
  const [visibilityId, setVisibilityId] =
    useState<PrePublishVisibilityId>("standard");
  const [flying, setFlying] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [addingPhotos, setAddingPhotos] = useState(false);
  const [shippingMode, setShippingMode] =
    useState<PrePublishShippingMode>("pickup_or_courier");
  const submitLockRef = useRef(false);
  const photosOptional = listingCategoryAllowsPhotoless(card.category);
  const publishButtonRef = useRef<HTMLButtonElement>(null);
  const planeIconRef = useRef<HTMLSpanElement>(null);
  const selected = getPrePublishVisibilityOption(visibilityId);

  // Instant idle icon after publish wipe / unmount — no stale airplane flash.
  useEffect(() => {
    if (!publishing) {
      setFlying(false);
      submitLockRef.current = false;
    }
  }, [publishing]);
  useEffect(() => {
    return () => {
      setFlying(false);
      submitLockRef.current = false;
    };
  }, []);

  const gallery = useMemo(
    () =>
      (card.imageUrls?.length
        ? card.imageUrls
        : card.imageUrl
          ? [card.imageUrl]
          : []
      )
        .map((u) => String(u ?? "").trim())
        .filter(Boolean),
    [card.imageUrl, card.imageUrls]
  );

  const omnivaEligibility = useMemo(
    () =>
      resolveOmnivaLockerEligibility({
        title: card.title,
        description: card.description,
        category: card.category,
        attributes: attributes as Record<string, unknown> | undefined,
      }),
    [attributes, card.category, card.description, card.title]
  );

  useEffect(() => {
    if (!open) {
      setFlying(false);
      setDragFrom(null);
      setDragOver(null);
      return;
    }
    // Sync shipping mode when PrePublish opens / eligibility changes.
    const next: PrePublishShippingMode = omnivaEligibility.eligible
      ? "omniva_locker"
      : "pickup_or_courier";
    setShippingMode(next);
    onFieldsChange?.({
      allowPastomatas: omnivaEligibility.eligible,
      attributes: {
        fitsOmnivaLocker: omnivaEligibility.fitsOmnivaLocker ? "true" : "false",
        estimatedSize: omnivaEligibility.estimatedSize,
      },
    });
    // Only re-run when eligibility flips — avoid draft write loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional open/eligibility sync
  }, [open, omnivaEligibility.eligible, omnivaEligibility.estimatedSize]);

  useEffect(() => {
    if (!open) {
      setFlying(false);
      setDragFrom(null);
      setDragOver(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const reorder = useCallback(
    (from: number, to: number) => {
      if (!onGalleryChange || from === to || from < 0 || to < 0) return;
      if (from >= gallery.length || to >= gallery.length) return;
      const next = [...gallery];
      const [picked] = next.splice(from, 1);
      if (!picked) return;
      next.splice(to, 0, picked);
      onGalleryChange(next);
    },
    [gallery, onGalleryChange]
  );

  const removeAt = useCallback(
    (idx: number) => {
      if (!onGalleryChange) return;
      // Physical goods keep at least one photo; text-only categories may clear all.
      if (!photosOptional && gallery.length <= 1) return;
      onGalleryChange(gallery.filter((_, i) => i !== idx));
    },
    [gallery, onGalleryChange, photosOptional]
  );

  const setCover = useCallback(
    (idx: number) => {
      if (!onGalleryChange || idx <= 0) return;
      reorder(idx, 0);
    },
    [onGalleryChange, reorder]
  );

  const addPhotos = useCallback(
    async (files: File[]) => {
      if (!onGalleryChange || busy || addingPhotos || !files.length) return;
      const slots = Math.max(0, 6 - gallery.length);
      if (!slots) return;
      setAddingPhotos(true);
      try {
        const urls = await readGalleryFilesAsDataUrls(files, slots);
        const merged = [...gallery];
        for (const url of urls) {
          if (url && !merged.includes(url)) merged.push(url);
        }
        onGalleryChange(merged.slice(0, 6));
      } finally {
        setAddingPhotos(false);
      }
    },
    [addingPhotos, busy, gallery, onGalleryChange]
  );

  const patchField = useCallback(
    (patch: PrePublishFieldPatch) => {
      onFieldsChange?.(patch);
    },
    [onFieldsChange]
  );

  const patchSpec = useCallback(
    (key: string, value: string) => {
      onFieldsChange?.({
        attributes: { [key]: value },
      });
    },
    [onFieldsChange]
  );

  const submitPublish = useCallback(async () => {
    // Single-fire publish — no duplicate plane / chat submit paths.
    if (
      submitLockRef.current ||
      publishing ||
      flying ||
      (!photosOptional && gallery.length === 0)
    ) {
      return;
    }
    submitLockRef.current = true;
    setFlying(true);
    const el = publishButtonRef.current;
    const rect = el?.getBoundingClientRect() ?? new DOMRect(0, 0, 0, 0);
    // Play the 3D card→plane animation first; only then hit publish API / redirect.
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, CARD_FOLD_PLANE_MS);
    });
    try {
      await onPublish(rect, visibilityId);
    } finally {
      setFlying(false);
      // Keep lock while parent `publishing` is true; release if publish aborted.
      if (!publishing) submitLockRef.current = false;
    }
  }, [
    flying,
    gallery.length,
    onPublish,
    photosOptional,
    publishing,
    visibilityId,
  ]);

  // Schema-less public specs only — vision/debug keys (Detected Objects,
  // Document Image URLs/Count, Scene Context, factNotes, preferredSizes,
  // deferredSalesDescription, …) are filtered in getDynamicAttributeEntries.
  const visibleSpecs = getDynamicAttributeEntries(
    attributes as Record<string, unknown> | undefined,
    card.category as ListingCategory | undefined
  ).slice(0, 16);

  if (!open || typeof document === "undefined") return null;

  const busy = publishing || flying;

  return createPortal(
    <div
      className={cn(
        "pre-publish-modal fixed inset-0 z-[110] flex flex-col bg-[var(--vauto-bg,#0b1220)]/72 backdrop-blur-[2px]",
        flying && "is-card-folding"
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Skelbimo peržiūra prieš publikavimą"
      data-prepublish-modal="1"
    >
      <div
        className={cn(
          "pre-publish-modal-panel mx-auto flex h-full w-full max-w-lg flex-col bg-[var(--vauto-card-bg)] shadow-2xl sm:my-3 sm:h-[min(96dvh,920px)] sm:rounded-2xl sm:border sm:border-[var(--vauto-primary)]/20",
          flying && "animate-card-fold-plane"
        )}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--vauto-border)]/60 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--vauto-primary)]">
              PrePublish
            </p>
            <h2 className="truncate text-base font-bold text-[var(--vauto-text)]">
              Peržiūra ir redagavimas
            </h2>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--vauto-border)] text-[var(--vauto-text-muted)] transition hover:bg-[var(--vauto-surface-muted)] disabled:opacity-50"
              aria-label="Uždaryti peržiūrą"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--vauto-text)]">
                Nuotraukos ({gallery.length})
              </p>
              {onGalleryChange ? (
                <p className="text-[10px] text-[var(--vauto-text-muted)]">
                  + pridėti · tempkite · × pašalinti · bakstelėkite viršeliui
                </p>
              ) : null}
            </div>
            {gallery.length || onGalleryChange ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {gallery.map((url, idx) => (
                  <div
                    key={`${url.slice(0, 40)}-${idx}`}
                    draggable={Boolean(onGalleryChange) && !busy}
                    onDragStart={() => setDragFrom(idx)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(idx);
                    }}
                    onDragLeave={() => setDragOver((v) => (v === idx ? null : v))}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragFrom != null) reorder(dragFrom, idx);
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                    onDragEnd={() => {
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                    className={cn(
                      "relative aspect-square overflow-hidden rounded-xl ring-1 ring-black/10",
                      idx === 0 && "ring-2 ring-[var(--vauto-primary)]",
                      dragOver === idx && "ring-2 ring-[var(--vauto-accent,#38bdf8)]",
                      onGalleryChange && "cursor-grab active:cursor-grabbing"
                    )}
                  >
                    <button
                      type="button"
                      disabled={!onGalleryChange || busy}
                      onClick={() => setCover(idx)}
                      className="absolute inset-0"
                      aria-label={
                        idx === 0 ? "Viršelio nuotrauka" : "Nustatyti viršeliu"
                      }
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    </button>
                    {onGalleryChange ? (
                      <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/55 p-0.5 text-white">
                        <GripVertical className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    ) : null}
                    {idx === 0 ? (
                      <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/65 p-0.5 text-amber-300">
                        <Star className="h-3 w-3 fill-current" aria-hidden />
                      </span>
                    ) : null}
                    {onGalleryChange &&
                    (photosOptional || gallery.length > 1) ? (
                      <button
                        type="button"
                        disabled={busy || addingPhotos}
                        onClick={() => removeAt(idx)}
                        className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/80 text-white shadow ring-1 ring-white/30"
                        aria-label="Pašalinti nuotrauką"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                ))}
                {onGalleryChange && gallery.length < 6 ? (
                  <ListingGalleryFileInput
                    label={addingPhotos ? "Kraunama…" : "Pridėti"}
                    hint={`${gallery.length}/6`}
                    icon={Plus}
                    disabled={busy || addingPhotos}
                    multiple
                    maxFiles={6 - gallery.length}
                    onFilesSelected={(files) => void addPhotos(files)}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--vauto-border)] bg-[var(--vauto-surface-muted)]/50 px-2 text-[var(--vauto-text-muted)] transition hover:border-[var(--vauto-primary)]/50 hover:bg-[var(--vauto-primary)]/5 hover:text-[var(--vauto-primary)] disabled:opacity-50 [&_svg]:h-6 [&_svg]:w-6"
                  />
                ) : null}
              </div>
            ) : photosOptional ? (
              <div className="rounded-xl border border-dashed border-[var(--vauto-border)] bg-[var(--vauto-surface-muted)]/40 px-3 py-8 text-center text-sm text-[var(--vauto-text-muted)]">
                Nuotraukos neprivalomos šiai kategorijai — galite publikuoti be
                jų.
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--vauto-border)] bg-[var(--vauto-surface-muted)]/40 px-3 py-8 text-center text-sm text-[var(--vauto-text-muted)]">
                Nėra viešų nuotraukų — pridėkite bent vieną.
              </div>
            )}
            {card.documentCount && card.documentCount > 0 ? (
              <p className="mt-2 text-[10px] leading-snug text-[var(--vauto-text-muted)]">
                +{card.documentCount} dokumentas(-ai) naudotas specs — viešame
                skelbime nerodomas.
              </p>
            ) : null}
          </section>

          <section className="space-y-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
                Antraštė
              </span>
              <input
                type="text"
                value={card.title}
                disabled={busy || !onFieldsChange}
                onChange={(e) => patchField({ title: e.target.value })}
                className="w-full rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-surface,#fff)] px-3 py-2.5 text-sm font-semibold text-[var(--vauto-text)] outline-none focus:border-[var(--vauto-primary)] focus:ring-2 focus:ring-[var(--vauto-primary)]/20 disabled:opacity-70"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
                Kaina (€)
              </span>
              <input
                type="number"
                min={0}
                inputMode="decimal"
                value={card.price > 0 ? card.price : ""}
                placeholder="0"
                disabled={busy || !onFieldsChange}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  patchField({
                    price: Number.isFinite(n) && n >= 0 ? n : 0,
                  });
                }}
                className="w-full rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-surface,#fff)] px-3 py-2.5 text-sm font-bold text-[var(--vauto-text)] outline-none focus:border-[var(--vauto-primary)] focus:ring-2 focus:ring-[var(--vauto-primary)]/20 disabled:opacity-70"
              />
              {card.vatLabelNet && card.vatLabelGross ? (
                <p
                  className="text-[11px] font-medium text-[var(--vauto-text-muted)]"
                  data-vat-line="1"
                >
                  {card.vatLabelGross} · {card.vatLabelNet}
                </p>
              ) : null}
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
                Miestas
              </span>
              <div className="relative">
                <MapPin
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--vauto-primary)]"
                  aria-hidden
                />
                <input
                  type="text"
                  value={card.location}
                  disabled={busy || !onFieldsChange}
                  onChange={(e) => patchField({ location: e.target.value })}
                  className="w-full rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-surface,#fff)] py-2.5 pl-9 pr-3 text-sm font-medium text-[var(--vauto-text)] outline-none focus:border-[var(--vauto-primary)] focus:ring-2 focus:ring-[var(--vauto-primary)]/20 disabled:opacity-70"
                />
              </div>
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
                Aprašymas
              </span>
              <textarea
                value={card.description}
                rows={8}
                disabled={busy || !onFieldsChange}
                onChange={(e) => patchField({ description: e.target.value })}
                className="w-full resize-y rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-surface,#fff)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--vauto-text)] outline-none focus:border-[var(--vauto-primary)] focus:ring-2 focus:ring-[var(--vauto-primary)]/20 disabled:opacity-70"
              />
            </label>

            {card.phone ? (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--vauto-text)]">
                <Phone
                  className="h-3.5 w-3.5 shrink-0 text-[var(--vauto-primary)]"
                  aria-hidden
                />
                {card.phone}
              </p>
            ) : null}
          </section>

          {visibleSpecs.length > 0 ? (
            <section className="space-y-2 rounded-xl border border-[var(--vauto-border)]/70 bg-[var(--vauto-surface-muted)]/25 p-3">
              <p className="text-sm font-semibold text-[var(--vauto-text)]">
                Specifikacijos
              </p>
              <p className="text-[11px] text-[var(--vauto-text-muted)]">
                Dinaminiai AI atributai — rodomi tik užpildyti laukai.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {visibleSpecs.map((spec) => (
                  <label key={spec.key} className="block space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
                      {spec.label || humanizeAttributeKey(spec.key)}
                    </span>
                    <input
                      type="text"
                      value={attrValue(attributes, spec.key)}
                      disabled={busy || !onFieldsChange}
                      onChange={(e) => patchSpec(spec.key, e.target.value)}
                      className="w-full rounded-lg border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] px-2.5 py-2 text-xs font-medium text-[var(--vauto-text)] outline-none focus:border-[var(--vauto-primary)] disabled:opacity-70"
                    />
                  </label>
                ))}
              </div>
            </section>
          ) : null}

          <PrePublishShippingOptions
            title={card.title}
            description={card.description}
            category={card.category}
            attributes={attributes}
            allowPastomatas={omnivaEligibility.eligible}
            value={shippingMode}
            disabled={busy || !onFieldsChange}
            onChange={(mode, eligibility) => {
              setShippingMode(mode);
              const allow = mode === "omniva_locker" && eligibility.eligible;
              onFieldsChange?.({
                allowPastomatas: allow,
                attributes: {
                  fitsOmnivaLocker: eligibility.fitsOmnivaLocker
                    ? "true"
                    : "false",
                  estimatedSize: eligibility.estimatedSize,
                },
              });
            }}
          />

          <section className="rounded-xl border border-[var(--vauto-primary)]/15 bg-[var(--vauto-surface-muted)]/30 p-3">
            <p className="text-sm font-bold text-[var(--vauto-text)]">
              Monetizacija — Free / Boost / Premium
            </p>
            {isLaunchPromoActive() ? (
              <p
                className="mt-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-[12px] font-semibold leading-snug text-emerald-800 dark:text-emerald-200"
                role="status"
                data-launch-promo="1"
              >
                {LAUNCH_PROMO_BADGE}
              </p>
            ) : null}
            <p className="mt-0.5 text-[11px] leading-snug text-[var(--vauto-text-muted)]">
              Pasirinkite matomumo planą prieš publikavimą
              {isLaunchPromoActive() ? " — starto akcijos metu 0 €." : " (serverio kainos)."}
            </p>
            <div
              className="mt-2 space-y-1.5"
              role="radiogroup"
              aria-label="Matomumo planas"
            >
              {PRE_PUBLISH_VISIBILITY_OPTIONS.map((opt) => {
                const active = visibilityId === opt.id;
                const tier = TIER_BADGE[opt.id];
                return (
                  <label
                    key={opt.id}
                    className={cn(
                      "flex cursor-pointer touch-manipulation items-start gap-2.5 rounded-lg border px-2.5 py-2.5 transition",
                      active
                        ? "border-[var(--vauto-primary)] bg-[var(--vauto-primary)]/8 ring-1 ring-[var(--vauto-primary)]/25"
                        : "border-[var(--vauto-border)]/80 bg-[var(--vauto-card-bg)] hover:border-[var(--vauto-primary)]/30"
                    )}
                  >
                    <input
                      type="radio"
                      name="pre-publish-modal-visibility"
                      value={opt.id}
                      checked={active}
                      disabled={busy}
                      onChange={() => setVisibilityId(opt.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--vauto-primary)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="rounded-md bg-[var(--vauto-primary)]/12 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--vauto-primary)]">
                          {tier.badge}
                        </span>
                        <span className="text-[13px] font-semibold text-[var(--vauto-text)]">
                          {tier.subtitle}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-[var(--vauto-text-muted)]">
                        {opt.description}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-bold text-[var(--vauto-text)]">
                      {opt.priceEur > 0 ? `${opt.priceEur.toFixed(2)} €` : "0 €"}
                    </span>
                  </label>
                );
              })}
            </div>
            {selected.priceEur > 0 ? (
              <p className="mt-2 text-[11px] font-medium text-[var(--vauto-primary)]">
                Pasirinkta: {TIER_BADGE[selected.id].badge} —{" "}
                {selected.priceEur.toFixed(2)} €
              </p>
            ) : null}
          </section>
        </div>

        <footer className="pre-publish-ai-bar shrink-0 border-t border-[var(--vauto-primary)]/15 bg-[var(--vauto-card-bg)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <div className="mb-2.5 flex items-start gap-2">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--vauto-primary)]/12 text-[var(--vauto-primary)]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            </span>
            <p className="text-[13px] leading-snug text-[var(--vauto-text)]">
              Viskas paruošta! Patvirtinkite ir skelbimas bus publikuotas.
            </p>
          </div>
          <button
            ref={publishButtonRef}
            type="button"
            disabled={busy || (!photosOptional && gallery.length === 0)}
            data-prepublish-submit="1"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void submitPublish();
            }}
            className="relative flex min-h-[52px] w-full touch-manipulation items-center justify-center gap-2 overflow-visible rounded-xl bg-[var(--vauto-primary)] px-4 py-3 text-sm font-bold text-[var(--vauto-primary-contrast,#fff)] shadow-md transition hover:opacity-95 active:scale-[0.99] disabled:opacity-60"
          >
            {publishing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Publikuojama…
              </>
            ) : flying ? (
              <>
                <span
                  ref={planeIconRef}
                  className="inline-flex animate-paper-plane-fly"
                  aria-hidden
                >
                  <SendHorizontal className="h-4 w-4" />
                </span>
                Siunčiama…
              </>
            ) : (
              <>
                <span ref={planeIconRef} className="inline-flex" aria-hidden>
                  <SendHorizontal className="h-4 w-4" />
                </span>
                Publikuoti skelbimą
              </>
            )}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
