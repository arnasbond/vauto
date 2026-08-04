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
import { AiBadge } from "@/components/ui/AiBadge";
import {
  ListingGalleryFileInput,
  readGalleryFilesAsDataUrls,
} from "@/components/listing/ListingGalleryFileInput";
import {
  getPrePublishEditableAttributeEntries,
  humanizeAttributeKey,
} from "@/lib/listing-dynamic-attributes";
import { PriceRangeBar } from "@/components/listing/PriceRangeBar";
import {
  appraisalToPriceAdvice,
  fetchListingPriceAppraisal,
} from "@/lib/price-appraisal";
import type { PriceAdvice } from "@/lib/price-advisor";
import { appraisalAttrsForDraft } from "@/lib/price-fit";
import { trackListingEvent } from "@/lib/listing-events";
import type { AiExtractedListing, ListingCategory } from "@/lib/types";
import {
  getPrePublishVisibilityOption,
  PRE_PUBLISH_PROMO_NOTE,
  PRE_PUBLISH_VISIBILITY_OPTIONS,
  type PrePublishVisibilityId,
} from "@/lib/listing-publish-visibility";
import type { PrePublishCardPayload } from "@/lib/pre-publish-validation";
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
  LAUNCH_PROMO_LISTING_NOTE,
} from "@vauto/shared/launch-promo";
import { listingCategoryAllowsPhotoless, listingPhotoLimitForCategory } from "@vauto/shared/listing-photo-policy";

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
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [addingPhotos, setAddingPhotos] = useState(false);
  const [shippingMode, setShippingMode] =
    useState<PrePublishShippingMode>("pickup_or_courier");
  /** Local attribute mirror — keeps controlled inputs stable while parent sanitizes. */
  const [localAttrs, setLocalAttrs] = useState<
    Record<string, string | string[] | undefined>
  >({});
  const [priceAdvice, setPriceAdvice] = useState<PriceAdvice | null>(null);
  const [priceAdviceLoading, setPriceAdviceLoading] = useState(false);
  const priceAdviceShownKeyRef = useRef("");
  const lastAppraisalRef = useRef<Awaited<
    ReturnType<typeof fetchListingPriceAppraisal>
  >>(null);
  const submitLockRef = useRef(false);
  const photosOptional = listingCategoryAllowsPhotoless(card.category);
  const photoLimit = listingPhotoLimitForCategory(card.category);
  const publishButtonRef = useRef<HTMLButtonElement>(null);
  const selected = getPrePublishVisibilityOption(visibilityId);

  useEffect(() => {
    if (!publishing) submitLockRef.current = false;
  }, [publishing]);
  useEffect(() => {
    return () => {
      submitLockRef.current = false;
    };
  }, []);

  // Sync local attribute mirror when modal opens / card identity changes.
  // Do not clobber in-progress keystrokes with slower parent echoes.
  useEffect(() => {
    if (!open) {
      setLocalAttrs({});
      return;
    }
    setLocalAttrs(attributes ?? {});
    // Reset when the draft card identity changes (new title/category).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: open + identity only
  }, [open, card.title, card.category]);

  useEffect(() => {
    if (!open || !attributes) return;
    setLocalAttrs((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [k, v] of Object.entries(attributes)) {
        if (!(k in next)) {
          next[k] = v;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [open, attributes]);

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

  const priceQueryKey = useMemo(
    () =>
      [
        card.title?.trim() ?? "",
        card.category ?? "",
        card.location?.trim() ?? "",
        attrValue(attributes, "make"),
        attrValue(attributes, "model"),
        attrValue(attributes, "year"),
        attrValue(attributes, "brand"),
      ].join("|"),
    [attributes, card.category, card.location, card.title]
  );

  const onFieldsChangeRef = useRef(onFieldsChange);
  onFieldsChangeRef.current = onFieldsChange;

  // Advisory price range — never blocks publish or AI chat.
  useEffect(() => {
    if (!open) {
      setPriceAdvice(null);
      setPriceAdviceLoading(false);
      priceAdviceShownKeyRef.current = "";
      lastAppraisalRef.current = null;
      return;
    }
    const title = card.title?.trim() ?? "";
    if (title.length < 3) {
      setPriceAdvice(null);
      setPriceAdviceLoading(false);
      lastAppraisalRef.current = null;
      return;
    }

    let cancelled = false;
    setPriceAdviceLoading(true);
    const timer = window.setTimeout(() => {
      const draft = {
        title: card.title,
        description: card.description,
        price: card.price,
        location: card.location,
        category: card.category,
        attributes: attributes as AiExtractedListing["attributes"],
      } as AiExtractedListing;

      void fetchListingPriceAppraisal(draft)
        .then((appraisal) => {
          if (cancelled) return;
          if (
            !appraisal ||
            !(appraisal.optimalPrice > 0 || appraisal.sampleSize > 0)
          ) {
            lastAppraisalRef.current = null;
            setPriceAdvice(null);
            return;
          }
          lastAppraisalRef.current = appraisal;
          const advice = appraisalToPriceAdvice(appraisal, card.price || 0);
          setPriceAdvice(advice);
          const shownKey = `${priceQueryKey}|${appraisal.minPrice}|${appraisal.optimalPrice}|${appraisal.maxPrice}|${appraisal.sampleSize}`;
          if (priceAdviceShownKeyRef.current !== shownKey) {
            priceAdviceShownKeyRef.current = shownKey;
            trackListingEvent("price_advice_shown", {
              category: String(card.category ?? ""),
              sampleSize: appraisal.sampleSize,
              optimalPrice: appraisal.optimalPrice,
              draftPrice: card.price || 0,
              verdict: advice.verdict,
            });
            onFieldsChangeRef.current?.({
              attributes: appraisalAttrsForDraft(appraisal),
            });
          }
        })
        .catch(() => {
          if (!cancelled) {
            lastAppraisalRef.current = null;
            setPriceAdvice(null);
          }
        })
        .finally(() => {
          if (!cancelled) setPriceAdviceLoading(false);
        });
    }, 700);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identity key only; price remaps locally
  }, [open, priceQueryKey, card.description]);

  // Remap verdict when seller edits price without re-hitting the API.
  useEffect(() => {
    const appraisal = lastAppraisalRef.current;
    if (!open || !appraisal) return;
    setPriceAdvice(appraisalToPriceAdvice(appraisal, card.price || 0));
  }, [open, card.price]);

  useEffect(() => {
    if (!open) {
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

  const busy = publishing;

  const addPhotos = useCallback(
    async (files: File[]) => {
      if (!onGalleryChange || busy || addingPhotos || !files.length) return;
      const slots = Math.max(0, photoLimit - gallery.length);
      if (!slots) return;
      setAddingPhotos(true);
      try {
        const urls = await readGalleryFilesAsDataUrls(files, slots);
        const merged = [...gallery];
        for (const url of urls) {
          if (url && !merged.includes(url)) merged.push(url);
        }
        onGalleryChange(merged.slice(0, photoLimit));
      } finally {
        setAddingPhotos(false);
      }
    },
    [addingPhotos, busy, gallery, onGalleryChange, photoLimit]
  );

  const patchField = useCallback(
    (patch: PrePublishFieldPatch) => {
      onFieldsChange?.(patch);
    },
    [onFieldsChange]
  );

  const patchSpec = useCallback(
    (key: string, value: string) => {
      setLocalAttrs((prev) => ({ ...prev, [key]: value }));
      onFieldsChange?.({
        attributes: { [key]: value },
      });
    },
    [onFieldsChange]
  );

  const submitPublish = useCallback(async () => {
    // Single-fire publish — celebration is the Lottie overlay (not CSS plane).
    if (
      submitLockRef.current ||
      publishing ||
      (!photosOptional && gallery.length === 0)
    ) {
      return;
    }
    submitLockRef.current = true;
    const el = publishButtonRef.current;
    const rect = el?.getBoundingClientRect() ?? new DOMRect(0, 0, 0, 0);
    try {
      await onPublish(rect, visibilityId);
    } finally {
      if (!publishing) submitLockRef.current = false;
    }
  }, [gallery.length, onPublish, photosOptional, publishing, visibilityId]);

  // Vehicles / clothing / electronics keep core inputs even when empty so clearing
  // a value does not remove the field. Vision/debug keys stay filtered out.
  const visibleSpecs = getPrePublishEditableAttributeEntries(
    localAttrs as Record<string, unknown>,
    card.category as ListingCategory | undefined
  );
  const isVehicleCategory =
    card.category === "vehicles" || card.category === "transport";

  const readSpecValue = (key: string): string => {
    if (key === "mileage") {
      return (
        attrValue(localAttrs, "mileage") ||
        attrValue(localAttrs, "mileageKm") ||
        ""
      );
    }
    if (key === "fuelType") {
      return (
        attrValue(localAttrs, "fuelType") || attrValue(localAttrs, "fuel") || ""
      );
    }
    if (key === "colors") {
      return (
        attrValue(localAttrs, "colors") || attrValue(localAttrs, "color") || ""
      );
    }
    return attrValue(localAttrs, key) || "";
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="pre-publish-modal fixed inset-0 z-[110] flex flex-col bg-[var(--vauto-bg,#0b1220)]/72 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Skelbimo peržiūra prieš publikavimą"
      data-prepublish-modal="1"
    >
      <div className="pre-publish-modal-panel mx-auto flex h-full w-full max-w-lg flex-col bg-[var(--vauto-card-bg)] shadow-[0_8px_40px_rgba(11,18,32,0.18)] sm:my-3 sm:h-[min(96dvh,920px)] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-[var(--vauto-border-subtle)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--vauto-border-subtle)] px-4 py-3">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <AiBadge>AI paruošė juodraštį</AiBadge>
              <span className="text-[11px] text-[var(--vauto-subtle)]">
                Kaina · Omniva · patvirtinimas
              </span>
            </div>
            <h2 className="truncate font-[family-name:var(--font-outfit)] text-base font-bold text-[var(--vauto-ink)]">
              Peržiūra prieš skelbimą
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
                {onGalleryChange && gallery.length < photoLimit ? (
                  <ListingGalleryFileInput
                    label={addingPhotos ? "Kraunama…" : "Pridėti"}
                    hint={`${gallery.length}/${photoLimit}`}
                    icon={Plus}
                    disabled={busy || addingPhotos}
                    multiple
                    maxFiles={photoLimit - gallery.length}
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
              <PriceRangeBar
                advice={priceAdvice}
                draftPrice={card.price || 0}
                loading={priceAdviceLoading}
                disabled={busy || !onFieldsChange}
                onApplyOptimal={(optimalPrice) => {
                  patchField({
                    price: optimalPrice,
                    attributes: priceAdvice
                      ? {
                          appraisalOptimalPrice: String(optimalPrice),
                          ...(priceAdvice.minPrice != null
                            ? {
                                appraisalMinPrice: String(
                                  Math.round(priceAdvice.minPrice)
                                ),
                              }
                            : {}),
                          ...(priceAdvice.maxPrice != null
                            ? {
                                appraisalMaxPrice: String(
                                  Math.round(priceAdvice.maxPrice)
                                ),
                              }
                            : {}),
                          ...(priceAdvice.appraisalScore != null
                            ? {
                                appraisalScore: String(
                                  Math.round(priceAdvice.appraisalScore)
                                ),
                              }
                            : {}),
                        }
                      : { appraisalOptimalPrice: String(optimalPrice) },
                  });
                  trackListingEvent("price_advice_applied", {
                    category: String(card.category ?? ""),
                    optimalPrice,
                    draftPrice: card.price || 0,
                  });
                }}
              />
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
                  placeholder="Įrašykite miestą"
                  disabled={busy || !onFieldsChange}
                  onChange={(e) =>
                    patchField({
                      location: e.target.value,
                      attributes: { locationEditedByUser: "true" },
                    })
                  }
                  className="w-full rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-surface,#fff)] py-2.5 pl-9 pr-3 text-sm font-medium text-[var(--vauto-text)] outline-none focus:border-[var(--vauto-primary)] focus:ring-2 focus:ring-[var(--vauto-primary)]/20 disabled:opacity-70 placeholder:font-normal placeholder:text-[var(--vauto-text-muted)]"
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

          {visibleSpecs.length > 0 || isVehicleCategory ? (
            <section className="space-y-2 rounded-xl border border-[var(--vauto-border)]/70 bg-[var(--vauto-surface-muted)]/25 p-3">
              <p className="text-sm font-semibold text-[var(--vauto-text)]">
                Specifikacijos
              </p>
              <p className="text-[11px] text-[var(--vauto-text-muted)]">
                {isVehicleCategory
                  ? "Galite bet ką pataisyti ranka — tušti laukai lieka redaguojami."
                  : "Dinaminiai AI atributai — redaguojami šiame lange."}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {visibleSpecs.map((spec) => (
                  <label key={spec.key} className="block space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
                      {spec.label || humanizeAttributeKey(spec.key)}
                    </span>
                    <input
                      type="text"
                      value={readSpecValue(spec.key)}
                      placeholder={
                        "placeholder" in spec && typeof spec.placeholder === "string"
                          ? spec.placeholder
                          : undefined
                      }
                      disabled={busy || !onFieldsChange}
                      onChange={(e) => patchSpec(spec.key, e.target.value)}
                      className="w-full rounded-lg border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] px-2.5 py-2 text-xs font-medium text-[var(--vauto-text)] outline-none placeholder:text-[var(--vauto-text-muted)]/70 focus:border-[var(--vauto-primary)] disabled:opacity-70"
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
                {LAUNCH_PROMO_BADGE} — {LAUNCH_PROMO_LISTING_NOTE}
              </p>
            ) : null}
            <p className="mt-0.5 text-[11px] leading-snug text-[var(--vauto-text-muted)]">
              {isLaunchPromoActive()
                ? PRE_PUBLISH_PROMO_NOTE
                : "Pasirinkite matomumo planą — bazinis įkėlimas nemokamas, papildomos paslaugos mokamos."}
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
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--vauto-ai-soft)] text-[var(--vauto-ai)]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            </span>
            <p className="text-[13px] leading-snug text-[var(--vauto-text)]">
              {selected.priceEur > 0
                ? `Bazinis skelbimas — 0 €. Po publikavimo — apmokėjimas už ${TIER_BADGE[selected.id].badge} (${selected.priceEur.toFixed(2)} €).`
                : "Viskas paruošta! Patikrinkite kainos rėžį ir Omniva — bazinis skelbimas publikuojamas nemokamai."}
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
            ) : selected.priceEur > 0 ? (
              <>
                <SendHorizontal className="h-4 w-4" aria-hidden />
                Publikuoti ir mokėti {selected.priceEur.toFixed(2)} €
              </>
            ) : (
              <>
                <SendHorizontal className="h-4 w-4" aria-hidden />
                Publikuoti nemokamai
              </>
            )}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
