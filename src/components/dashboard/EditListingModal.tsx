"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GripVertical, Plus, Star, X } from "lucide-react";
import { BaseFieldsEditor } from "@/components/adaptive-confirmation/BaseFieldsEditor";
import { CategoryFieldsEditor } from "@/components/adaptive-confirmation/CategoryFieldsEditor";
import {
  ListingGalleryFileInput,
  readGalleryFilesAsDataUrls,
} from "@/components/listing/ListingGalleryFileInput";
import {
  getAdaptiveConfig,
  getMissingCriticalFields,
  listingToAdaptiveKey,
} from "@/lib/adaptive-categories";
import { cn } from "@/lib/cn";
import {
  collectListingGalleryCandidates,
  filterSessionListingImages,
  isListingPlaceholderUrl,
} from "@/lib/listing-image";
import {
  draftToListingPatch,
  listingToDraft,
  type ListingEditPatch,
} from "@/lib/listing-edit";
import type { AiExtractedListing, Listing, ListingCategory } from "@/lib/types";
import {
  listingCategoryAllowsPhotoless,
  listingPhotoLimitForCategory,
} from "@vauto/shared/listing-photo-policy";

const CATEGORY_OPTIONS: { value: ListingCategory; label: string }[] = [
  { value: "electronics", label: "Elektronika" },
  { value: "vehicles", label: "Transportas" },
  { value: "services", label: "Paslaugos" },
  { value: "jobs", label: "Darbas" },
  { value: "home", label: "Namams" },
  { value: "clothing", label: "Apranga" },
  { value: "real_estate", label: "Nekilnojamas turtas" },
  { value: "other", label: "Kita" },
];

interface EditListingModalProps {
  listing: Listing | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (id: string, patch: ListingEditPatch) => void | Promise<void>;
}

function initialGalleryFromListing(listing: Listing): string[] {
  return filterSessionListingImages(
    collectListingGalleryCandidates(listing),
    { attributes: listing.attributes }
  ).filter((url) => !isListingPlaceholderUrl(url));
}

export function EditListingModal({
  listing,
  saving = false,
  onClose,
  onSave,
}: EditListingModalProps) {
  const [draft, setDraft] = useState<AiExtractedListing | null>(null);
  const [gallery, setGallery] = useState<string[]>([]);
  const [addingPhotos, setAddingPhotos] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!listing) {
      setDraft(null);
      setGallery([]);
      setSubmitError(null);
      return;
    }
    setDraft(listingToDraft(listing));
    setGallery(initialGalleryFromListing(listing));
    setSubmitError(null);
  }, [listing]);

  const photoLimit = useMemo(
    () => listingPhotoLimitForCategory(draft?.category ?? listing?.category),
    [draft?.category, listing?.category]
  );
  const photosOptional = listingCategoryAllowsPhotoless(
    draft?.category ?? listing?.category
  );

  const reorder = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0) return;
      setGallery((prev) => {
        if (from >= prev.length || to >= prev.length) return prev;
        const next = [...prev];
        const [item] = next.splice(from, 1);
        if (!item) return prev;
        next.splice(to, 0, item);
        return next;
      });
    },
    []
  );

  const removeAt = useCallback(
    (idx: number) => {
      if (!photosOptional && gallery.length <= 1) return;
      setGallery((prev) => prev.filter((_, i) => i !== idx));
    },
    [gallery.length, photosOptional]
  );

  const setCover = useCallback((idx: number) => {
    if (idx <= 0) return;
    setGallery((prev) => {
      if (idx >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      if (!item) return prev;
      next.unshift(item);
      return next;
    });
  }, []);

  const addPhotos = useCallback(
    async (files: File[]) => {
      if (saving || addingPhotos || !files.length) return;
      const slots = Math.max(0, photoLimit - gallery.length);
      if (!slots) return;
      setAddingPhotos(true);
      try {
        const urls = await readGalleryFilesAsDataUrls(files, slots);
        setGallery((prev) => {
          const merged = [...prev];
          for (const url of urls) {
            if (url && !merged.includes(url)) merged.push(url);
          }
          return merged.slice(0, photoLimit);
        });
      } finally {
        setAddingPhotos(false);
      }
    },
    [addingPhotos, gallery.length, photoLimit, saving]
  );

  if (!listing || !draft) return null;

  const adaptiveKey = listingToAdaptiveKey(draft.category);
  const config = getAdaptiveConfig(adaptiveKey);
  const attributes = draft.attributes ?? {};
  const needsPrice = draft.price <= 0;
  const missingKeys = getMissingCriticalFields(adaptiveKey, attributes, {
    price: draft.price,
    description: draft.description,
  });
  const hasRequiredPhoto = photosOptional || gallery.length > 0;
  const canSave =
    missingKeys.length === 0 && draft.price > 0 && hasRequiredPhoto && !saving;

  const layoutMap = {
    "technical-grid": "grid" as const,
    "tag-social": "tags" as const,
    "service-profile": "stack" as const,
    "estate-sheet": "sheet" as const,
    universal: "stack" as const,
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSubmitError(null);
    try {
      await onSave(listing.id, {
        ...draftToListingPatch(draft),
        images: gallery,
      });
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Nepavyko išsaugoti pakeitimų."
      );
    }
  };

  return (
    <div className="fixed inset-0 z-[205] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Redaguoti skelbimą"
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[var(--vauto-border-subtle)] bg-[var(--vauto-card-bg,#0f172a)] p-5 shadow-2xl sm:rounded-3xl sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--vauto-ink,#fff)]">
              Redaguoti skelbimą
            </h2>
            <p className="mt-1 text-xs text-[var(--vauto-text-muted)]">
              {config.label}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full bg-black/10 p-2 text-[var(--vauto-text-muted)] disabled:opacity-50"
            aria-label="Uždaryti"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <section className="mb-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--vauto-ink,#fff)]">
              Nuotraukos ({gallery.length})
            </p>
            <p className="text-[10px] text-[var(--vauto-text-muted)]">
              + pridėti · × pašalinti · bakstelėkite viršeliui
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {gallery.map((url, idx) => (
              <div
                key={`${url.slice(0, 48)}-${idx}`}
                draggable={!saving}
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
                  idx === 0 && "ring-2 ring-[var(--vauto-primary,#14b8a6)]",
                  dragOver === idx && "ring-2 ring-sky-400",
                  "cursor-grab active:cursor-grabbing"
                )}
              >
                <button
                  type="button"
                  disabled={saving}
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
                <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/55 p-0.5 text-white">
                  <GripVertical className="h-3.5 w-3.5" aria-hidden />
                </span>
                {idx === 0 ? (
                  <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/65 p-0.5 text-amber-300">
                    <Star className="h-3 w-3 fill-current" aria-hidden />
                  </span>
                ) : null}
                {photosOptional || gallery.length > 1 ? (
                  <button
                    type="button"
                    disabled={saving || addingPhotos}
                    onClick={() => removeAt(idx)}
                    className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/80 text-white shadow ring-1 ring-white/30"
                    aria-label="Pašalinti nuotrauką"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ) : null}
              </div>
            ))}
            {gallery.length < photoLimit ? (
              <ListingGalleryFileInput
                label={addingPhotos ? "Kraunama…" : "Pridėti"}
                hint={`${gallery.length}/${photoLimit}`}
                icon={Plus}
                disabled={saving || addingPhotos}
                multiple
                maxFiles={photoLimit - gallery.length}
                onFilesSelected={(files) => void addPhotos(files)}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--vauto-border)] bg-[var(--vauto-surface-muted)]/40 px-2 text-[var(--vauto-text-muted)] transition hover:border-[var(--vauto-primary)]/50 hover:bg-[var(--vauto-primary)]/5 hover:text-[var(--vauto-primary)] disabled:opacity-50 [&_svg]:h-6 [&_svg]:w-6"
              />
            ) : null}
          </div>
          {!photosOptional && gallery.length === 0 ? (
            <p className="mt-2 text-xs text-amber-600">
              Pridėkite bent vieną nuotrauką — ji taps viršeliu.
            </p>
          ) : null}
        </section>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs text-[var(--vauto-text-muted)]">
            Kategorija
          </span>
          <select
            value={draft.category}
            disabled={saving}
            onChange={(e) =>
              setDraft((d) =>
                d ? { ...d, category: e.target.value as ListingCategory } : d
              )
            }
            className="w-full rounded-xl border border-[var(--vauto-border-input)] bg-[var(--vauto-surface-page,#111827)] px-3 py-2.5 text-sm text-[var(--vauto-ink,#fff)] outline-none"
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {draft.category === "jobs" && (
          <div className="mb-4 rounded-xl border border-violet-500/30 bg-violet-500/10 p-3 text-xs text-violet-200">
            Darbo skelbimai: pasirinkite ar <strong>siūlote darbą</strong>, ar{" "}
            <strong>ieškote darbo</strong> — skirtingi laukai ir paieška.
          </div>
        )}

        <BaseFieldsEditor
          draft={draft}
          fields={config.baseFields}
          needsPrice={needsPrice}
          onUpdate={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
        />

        {config.fields.length > 0 && (
          <div className="mt-4">
            {config.layout === "technical-grid" && (
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--vauto-text-muted)]">
                Papildoma informacija
              </p>
            )}
            <CategoryFieldsEditor
              fields={config.fields}
              attributes={attributes}
              onChange={(key, value) =>
                setDraft((d) =>
                  d
                    ? {
                        ...d,
                        attributes: { ...(d.attributes ?? {}), [key]: value },
                      }
                    : d
                )
              }
              layout={layoutMap[config.layout]}
              missingKeys={missingKeys}
            />
          </div>
        )}

        {submitError ? (
          <p className="mt-4 text-sm text-rose-500" role="alert">
            {submitError}
          </p>
        ) : null}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl bg-black/10 py-3 text-sm text-[var(--vauto-text-muted)] disabled:opacity-50"
          >
            Atšaukti
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => void handleSave()}
            className="flex-1 rounded-xl bg-[var(--vauto-teal,#14b8a6)] py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving
              ? "Saugoma…"
              : canSave
                ? "Išsaugoti pakeitimus"
                : "Užpildykite privalomus laukus"}
          </button>
        </div>
      </div>
    </div>
  );
}
