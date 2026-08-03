"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GripVertical, Plus, Star, X } from "lucide-react";
import {
  ListingGalleryFileInput,
  readGalleryFilesAsDataUrls,
} from "@/components/listing/ListingGalleryFileInput";
import {
  getAdaptiveConfig,
  listingToAdaptiveKey,
  type CategoryFieldDef,
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

/** Internal / gallery keys — never show as editable attribute rows. */
const HIDDEN_ATTR_KEYS = new Set([
  "galleryUrls",
  "orderedImageUrls",
  "imageUrls",
  "photoUrls",
  "documentImageUrls",
  "documentUrls",
  "sellIntentActive",
  "salesCopyGenerated",
  "clientDraftId",
  "isAiTwinActive",
  "visibilityTier",
  "fitsOmnivaLocker",
  "estimatedParcelSize",
]);

const inputClass =
  "mt-1 w-full rounded-xl border border-[var(--vauto-border-input,#cbd5e1)] bg-[var(--vauto-surface-page,#fff)] px-3 py-2.5 text-sm text-[var(--vauto-ink,#0f172a)] outline-none focus:border-[var(--vauto-teal,#14b8a6)]";
const labelClass = "mb-1 block text-xs font-medium text-[var(--vauto-text-muted,#64748b)]";

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

function attrDisplayValue(
  value: string | string[] | undefined
): string {
  if (Array.isArray(value)) return value.join(", ");
  return typeof value === "string" ? value : "";
}

/**
 * Edit form shows only attributes that already have values on the listing,
 * matched to the category schema when possible — never dumps empty phone
 * placeholders onto a guitar / “Kita” listing.
 */
function resolveEditableAttributeFields(
  category: ListingCategory,
  attributes: Record<string, string | string[] | undefined>
): CategoryFieldDef[] {
  const config = getAdaptiveConfig(listingToAdaptiveKey(category));
  const byKey = new Map(config.fields.map((f) => [f.key, f]));
  const keys = Object.keys(attributes).filter((key) => {
    if (HIDDEN_ATTR_KEYS.has(key)) return false;
    const raw = attributes[key];
    if (raw == null) return false;
    if (Array.isArray(raw)) return raw.length > 0;
    return String(raw).trim().length > 0;
  });
  return keys.map(
    (key) =>
      byKey.get(key) ?? {
        key,
        label: key,
        inputType: "text" as const,
      }
  );
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
    // Always hydrate from the live listing snapshot (initial values).
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

  const attributeFields = useMemo(
    () =>
      draft
        ? resolveEditableAttributeFields(draft.category, draft.attributes ?? {})
        : [],
    [draft]
  );

  const reorder = useCallback((from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setGallery((prev) => {
      if (from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      if (!item) return prev;
      next.splice(to, 0, item);
      return next;
    });
  }, []);

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

  const title = (draft.title ?? "").trim();
  const description = (draft.description ?? "").trim();
  const contact = (draft.contact ?? "").trim();
  const location = (draft.location ?? "").trim();
  const hasRequiredPhoto = photosOptional || gallery.length > 0;
  const canSave =
    Boolean(title) &&
    draft.price > 0 &&
    hasRequiredPhoto &&
    !saving;

  const patchField = (patch: Partial<AiExtractedListing>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSubmitError(null);
    try {
      await onSave(listing.id, {
        ...draftToListingPatch({
          ...draft,
          title,
          description,
          contact,
          location,
        }),
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
        data-edit-listing-modal="1"
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[var(--vauto-border-subtle,#e2e8f0)] bg-[var(--vauto-card-bg,#ffffff)] p-5 shadow-2xl sm:rounded-3xl sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--vauto-ink,#0f172a)]">
              Redaguoti skelbimą
            </h2>
            <p className="mt-1 text-xs text-[var(--vauto-text-muted,#64748b)]">
              {CATEGORY_OPTIONS.find((o) => o.value === draft.category)?.label ??
                draft.category}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full bg-black/5 p-2 text-[var(--vauto-text-muted,#64748b)] disabled:opacity-50"
            aria-label="Uždaryti"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <section className="mb-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--vauto-ink,#0f172a)]">
              Nuotraukos ({gallery.length})
            </p>
            <p className="text-[10px] text-[var(--vauto-text-muted,#64748b)]">
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
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--vauto-border,#cbd5e1)] bg-[var(--vauto-surface-muted,#f8fafc)] px-2 text-[var(--vauto-text-muted,#64748b)] transition hover:border-[var(--vauto-primary)]/50 disabled:opacity-50 [&_svg]:h-6 [&_svg]:w-6"
              />
            ) : null}
          </div>
        </section>

        <label className="mb-3 block">
          <span className={labelClass}>Kategorija</span>
          <select
            name="category"
            value={draft.category}
            disabled={saving}
            onChange={(e) =>
              patchField({ category: e.target.value as ListingCategory })
            }
            className={inputClass}
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-3 block">
          <span className={labelClass}>Pavadinimas</span>
          <input
            name="title"
            type="text"
            value={draft.title ?? ""}
            disabled={saving}
            onChange={(e) => patchField({ title: e.target.value })}
            className={inputClass}
            autoComplete="off"
          />
        </label>

        <label className="mb-3 block">
          <span className={labelClass}>Kaina (€)</span>
          <input
            name="price"
            type="number"
            min={0}
            step={1}
            value={draft.price > 0 ? draft.price : ""}
            disabled={saving}
            onChange={(e) =>
              patchField({ price: parseInt(e.target.value, 10) || 0 })
            }
            className={inputClass}
          />
        </label>

        <label className="mb-3 block">
          <span className={labelClass}>Vieta</span>
          <input
            name="location"
            type="text"
            value={draft.location ?? ""}
            disabled={saving}
            onChange={(e) => patchField({ location: e.target.value })}
            className={inputClass}
            autoComplete="off"
          />
        </label>

        <label className="mb-3 block">
          <span className={labelClass}>Kontaktai</span>
          <input
            name="contact"
            type="text"
            value={draft.contact ?? ""}
            disabled={saving}
            onChange={(e) => patchField({ contact: e.target.value })}
            className={inputClass}
            autoComplete="tel"
          />
        </label>

        <label className="mb-3 block">
          <span className={labelClass}>Aprašymas</span>
          <textarea
            name="description"
            rows={4}
            value={draft.description ?? ""}
            disabled={saving}
            onChange={(e) => patchField({ description: e.target.value })}
            className={inputClass}
          />
        </label>

        {attributeFields.length > 0 ? (
          <div className="mb-3 space-y-3 rounded-xl border border-[var(--vauto-border,#e2e8f0)] bg-[var(--vauto-surface-muted,#f8fafc)] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--vauto-text-muted,#64748b)]">
              Papildomi laukai
            </p>
            {attributeFields.map((field) => (
              <label key={field.key} className="block">
                <span className={labelClass}>{field.label}</span>
                <input
                  name={`attr_${field.key}`}
                  type="text"
                  value={attrDisplayValue(draft.attributes?.[field.key])}
                  disabled={saving}
                  onChange={(e) =>
                    setDraft((d) =>
                      d
                        ? {
                            ...d,
                            attributes: {
                              ...(d.attributes ?? {}),
                              [field.key]: e.target.value,
                            },
                          }
                        : d
                    )
                  }
                  className={inputClass}
                />
              </label>
            ))}
          </div>
        ) : null}

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
            className="flex-1 rounded-xl bg-black/5 py-3 text-sm text-[var(--vauto-text-muted,#64748b)] disabled:opacity-50"
          >
            Atšaukti
          </button>
          <button
            type="button"
            name="save"
            data-edit-save="1"
            disabled={!canSave}
            onClick={() => void handleSave()}
            className="flex-1 rounded-xl bg-[var(--vauto-teal,#14b8a6)] py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? "Saugoma…" : "Išsaugoti pakeitimus"}
          </button>
        </div>
      </div>
    </div>
  );
}
