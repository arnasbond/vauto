"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { BaseFieldsEditor } from "@/components/adaptive-confirmation/BaseFieldsEditor";
import { CategoryFieldsEditor } from "@/components/adaptive-confirmation/CategoryFieldsEditor";
import {
  getAdaptiveConfig,
  getMissingCriticalFields,
  listingToAdaptiveKey,
} from "@/lib/adaptive-categories";
import {
  draftToListingPatch,
  listingToDraft,
  type ListingEditPatch,
} from "@/lib/listing-edit";
import type { AiExtractedListing, Listing, ListingCategory } from "@/lib/types";

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
  onClose: () => void;
  onSave: (id: string, patch: ListingEditPatch) => void;
}

export function EditListingModal({
  listing,
  onClose,
  onSave,
}: EditListingModalProps) {
  const [draft, setDraft] = useState<AiExtractedListing | null>(null);

  useEffect(() => {
    if (listing) setDraft(listingToDraft(listing));
    else setDraft(null);
  }, [listing]);

  if (!listing || !draft) return null;

  const adaptiveKey = listingToAdaptiveKey(draft.category);
  const config = getAdaptiveConfig(adaptiveKey);
  const attributes = draft.attributes ?? {};
  const needsPrice = draft.price <= 0;
  const missingKeys = getMissingCriticalFields(adaptiveKey, attributes, {
    price: draft.price,
    description: draft.description,
  });
  const canSave = missingKeys.length === 0 && draft.price > 0;

  const layoutMap = {
    "technical-grid": "grid" as const,
    "tag-social": "tags" as const,
    "service-profile": "stack" as const,
    "estate-sheet": "sheet" as const,
    universal: "stack" as const,
  };

  return (
    <div className="fixed inset-0 z-[205] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-[#1e293b] p-6 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Redaguoti skelbimą</h2>
            <p className="mt-1 text-xs text-slate-400">
              {config.label} · {config.portalStyle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/10 p-2 text-slate-300"
            aria-label="Uždaryti"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs text-slate-400">Kategorija</span>
          <select
            value={draft.category}
            onChange={(e) =>
              setDraft((d) =>
                d ? { ...d, category: e.target.value as ListingCategory } : d
              )
            }
            className="w-full rounded-xl bg-white/10 px-3 py-2.5 text-sm text-white outline-none"
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-slate-800">
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
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
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

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-white/10 py-3 text-sm text-slate-300"
          >
            Atšaukti
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => {
              onSave(listing.id, draftToListingPatch(draft));
              onClose();
            }}
            className="flex-1 rounded-xl bg-[var(--vauto-teal)] py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {canSave ? "Išsaugoti pakeitimus" : "Užpildykite privalomus laukus"}
          </button>
        </div>
      </div>
    </div>
  );
}
