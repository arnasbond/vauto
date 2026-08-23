"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Sparkles, X } from "lucide-react";
import {
  interpretAiFacets,
  type FacetChip,
} from "@/lib/ai-facet-interpretation";
import {
  applyAiFacet,
  applyFacetChips,
  chipToFacetTarget,
  removeAiFacet,
} from "@/lib/apply-ai-facet";
import { categoryFilterFieldsFor } from "@/lib/category-attribute-filters";
import type { MarketplaceFilterState } from "@/lib/marketplace-view";
import { syncMarketplaceFiltersToUrl } from "@/lib/marketplace-filter-url";
import { cn } from "@/lib/cn";

/**
 * Stage 18A/18B — "AI suvokė" chips.
 *
 * Surfaces how VAUTO understood a natural-language request as editable,
 * removable and addable chips. Each chip maps 1:1 onto a canonical
 * MarketplaceFilterState field (or a canonical category-attribute key), so this
 * is an adapter into the existing search/facet system — not a separate model.
 * The interpretation is deterministic (local), so the classic search keeps
 * working even when any remote AI endpoint is unavailable (18C).
 */

export interface AiInterpretationChipsProps {
  searchQuery: string;
  filters: MarketplaceFilterState;
  onFiltersChange: (next: MarketplaceFilterState) => void;
  /** Optional — used when removing a keyword (make/model) chip and updating the search box. */
  onQueryChange?: (next: string) => void;
}

/** Map a chip's canonical field back to an edit target (shared production helper). */

export function AiInterpretationChips({
  searchQuery,
  filters,
  onFiltersChange,
  onQueryChange,
}: AiInterpretationChipsProps) {
  const query = searchQuery.trim();
  const interpretation = useMemo(() => interpretAiFacets(query), [query]);
  const rawChips = interpretation.chips;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // Facet ids the user explicitly removed this submission. Decoupled from the
  // applied filter state so the AI readout stays stable (18A): it reflects what
  // VAUTO understood, and a facet disappears only when the user removes it (or
  // the query changes). Agent-driven result overrides therefore cannot make
  // interpreted criteria silently vanish.
  const [removedChipIds, setRemovedChipIds] = useState<string[]>([]);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // Reset the removed-set whenever a new query is submitted/edited so a fresh
  // interpretation starts with the full, visible readout again.
  useEffect(() => {
    setRemovedChipIds([]);
    setEditingId(null);
    setAddOpen(false);
  }, [query]);

  // Chips reflect what AI understood, minus facets the user removed.
  const chips = useMemo(
    () => rawChips.filter((chip) => !removedChipIds.includes(chip.id)),
    [rawChips, removedChipIds]
  );

  // Apply the interpretation's canonical base/attribute facets to the shared
  // filter state once per query, so results agree with what AI understood
  // (18B adapter → canonical search state). Keyword chips (make/model) are NOT
  // applied here — they edit the search query itself. A re-submit or a changed
  // query re-applies; a manual removal stays removed (matched via filter state).
  const appliedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!query) return;
    if (appliedRef.current === query) return;
    appliedRef.current = query;
    // Apply the interpretation via the single production write bridge.
    onFiltersChange(applyFacetChips(filters, rawChips));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot per query
  }, [query]);

  // Stage 18.3 — persist the interpreted (and user-edited) facet set into the
  // search URL via the complementary layer so reload/deep-link restores it
  // without re-running AI interpretation. Fires whenever the applied filter
  // state's URL-serializable fields change; the sync is a guarded replaceState
  // no-op when the produced href equals the current one.
  useEffect(() => {
    if (!query) return;
    syncMarketplaceFiltersToUrl(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync on serializable state change
  }, [
    filters.location,
    filters.priceMin,
    filters.priceMax,
    filters.condition,
    filters.radiusKm,
    filters.sort,
    filters.category,
    filters.categoryAttributes,
    filters.facetQueryString,
    query,
  ]);

  if (!query) return null;

  const vertical = interpretation.vertical;

  const chipHasEditingSurface = (chip: FacetChip) =>
    chip.kind === "attribute" &&
    (chip.options?.length ?? 0) > 0;

  const commitChip = (chip: FacetChip, rawValue: string) => {
    const target = chipToFacetTarget(chip, rawValue);
    if (target) onFiltersChange(applyAiFacet(filters, target));
    setEditingId(null);
  };

  // Canonical attribute fields offered by the "add" control for this vertical.
  const addableAttributes = categoryFilterFieldsFor(vertical).filter(
    (f) => !chips.some((c) => c.field === f.key)
  );

  const renderChip = (chip: FacetChip) => {
    const editing = editingId === chip.id;
    const isEnum = chip.kind === "attribute" && (chip.options?.length ?? 0) > 0;
    const fieldLabel =
      chip.field === "priceMax"
        ? "Kaina iki"
        : chip.field === "priceMin"
          ? "Kaina nuo"
          : chip.label;
    const display = chip.value;

    return (
      <li key={chip.id} className="inline-flex items-center">
        <div
          className={cn(
            "group inline-flex items-center gap-1.5 rounded-full border py-1 pl-3 pr-1.5 text-xs font-medium transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--ds-focus)]",
            chip.kind === "vertical"
              ? "border-[var(--ds-border-accent)] bg-[var(--ds-surface-accent)] text-[var(--ds-brand)]"
              : "border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] text-[var(--ds-text-primary)]"
          )}
          data-ai-chip
          data-chip-kind={chip.kind}
          data-chip-field={chip.field}
        >
          <button
            type="button"
            data-ai-chip-edit
            aria-label={`Pakeisti: ${fieldLabel}`}
            onClick={() => {
              if (chip.kind === "keyword") return; // edited via search box
              if (!chipHasEditingSurface(chip)) return;
              setEditingId(editing ? null : chip.id);
            }}
            className="focus-visible:outline-none"
          >
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="opacity-80">{fieldLabel}</span>
              <span className="font-semibold text-[var(--ds-text-primary)]">{display}</span>
            </span>
          </button>

          {editing && isEnum && (
            <select
              autoFocus
              data-ai-chip-editor
              value={chip.value}
              onChange={(e) => commitChip(chip, e.target.value)}
              onBlur={() => setEditingId(null)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditingId(null);
              }}
              className="h-6 rounded-full border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-page)] px-1.5 text-[11px] text-[var(--ds-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus)]"
            >
              {(chip.options ?? []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            data-ai-chip-remove
            aria-label={`Pašalinti filtro kriterijų: ${fieldLabel} ${display}`}
            onClick={() => {
              // Always hide the chip locally on this query (18A — a removed
              // criterion stays gone). Keyword chips also clear the search box.
              setRemovedChipIds((ids) =>
                ids.includes(chip.id) ? ids : [...ids, chip.id]
              );
              if (chip.kind === "keyword") {
                // Keyword chips (make/model) edit/clear the search query itself.
                if (onQueryChange) {
                  const next = query
                    .replace(new RegExp(`\\b${escapeRegExp(display)}\\b`, "gi"), " ")
                    .replace(/\s+/g, " ")
                    .trim();
                  onQueryChange(next);
                }
                return;
              }
              const removeTarget = chipToRemoveKey(chip);
              if (removeTarget) onFiltersChange(removeAiFacet(filters, removeTarget));
            }}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-surface-muted)] hover:text-[var(--ds-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus)]"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </li>
    );
  };

  return (
    <section
      aria-label="Kaip AI suprato jūsų užklausą"
      data-ai-interpretation
      className="mb-4"
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
        <Sparkles className="h-3.5 w-3.5 text-[var(--ds-brand)]" aria-hidden />
        <span>AI pateikė kriterijus — juos galite keisti arba pašalinti</span>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <ul
          data-ai-chips
          className="flex flex-wrap items-center gap-2"
          aria-label="AI interpretuoti paieškos kriterijai"
        >
          {chips.map(renderChip)}
        </ul>
        <div className="relative" ref={addMenuRef}>
          <button
            type="button"
            data-ai-chip-add
            onClick={() => setAddOpen((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setAddOpen(false);
            }}
            aria-haspopup="menu"
            aria-expanded={addOpen}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--ds-border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--ds-text-muted)] transition-colors hover:border-[var(--ds-brand)] hover:text-[var(--ds-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus)]"
          >
            <Plus className="h-3 w-3" aria-hidden />
            Pridėti filtrą
          </button>
          {addOpen ? (
            <>
              <button
                type="button"
                aria-hidden
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setAddOpen(false)}
                tabIndex={-1}
              />
              <div
                role="menu"
                aria-label="Pridėti filtrą"
                data-ai-add-menu
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setAddOpen(false);
                  }
                }}
                className="absolute z-20 mt-2 w-56 rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] p-1.5 shadow-xl"
              >
                <p className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Kainos ir vieta
                </p>
                {addBaseOptions().map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    role="menuitem"
                    data-ai-add-menu-item={o.key}
                    onClick={() => onAddBase(o)}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs text-[var(--ds-text-primary)] transition-colors hover:bg-[var(--ds-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus)]"
                  >
                    {o.label}
                  </button>
                ))}
                {addableAttributes.length > 0 ? (
                  <>
                    <p className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                      Kategorijos kriterijai
                    </p>
                    {addableAttributes.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        role="menuitem"
                        data-ai-add-menu-item={f.key}
                        onClick={() => onAddAttribute(f.key, f.options)}
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs text-[var(--ds-text-primary)] transition-colors hover:bg-[var(--ds-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus)]"
                      >
                        {f.label}
                      </button>
                    ))}
                  </>
                ) : null}
                <p className="px-2 pb-1 pt-2 text-[10px] text-[var(--ds-text-muted)]">
                  Pridėti kriterijai patenka į esamus filtrus.
                </p>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );

  function addBaseOptions(): Array<{ key: string; label: string }> {
    const out: Array<{ key: string; label: string }> = [
      { key: "location", label: "Vietovė" },
      { key: "priceMax", label: "Kaina iki" },
      { key: "priceMin", label: "Kaina nuo" },
      { key: "condition", label: "Būklė" },
      { key: "radiusKm", label: "Spindulys" },
    ];
    return out;
  }

  function onAddBase(o: { key: string; label: string }) {
    // Default value that the user then edits through the canonical controls.
    const target = baseDefaultTarget(o.key);
    if (target) onFiltersChange(applyAiFacet(filters, target));
    setAddOpen(false);
  }

  function onAddAttribute(key: string, options?: readonly string[]) {
    const defaults: Record<string, string> = {
      condition: "Naudotas",
      fuelType: "Dyzelinas",
      bodyType: "Sedanas",
      propertyType: "Butas",
      locationType: "Nuotolinis",
      jobType: "Darbo pasiūlymas",
      employmentType: "Pilnas etatas",
    };
    const value = defaults[key] ?? options?.[0] ?? "";
    if (value) onFiltersChange(applyAiFacet(filters, { type: "attribute", key, value }));
    setAddOpen(false);
  }

  function baseDefaultTarget(
    key: string
  ): Parameters<typeof applyAiFacet>[1] | null {
    switch (key) {
      case "location":
        return { type: "location", value: "" };
      case "priceMax":
        return { type: "price", field: "priceMax", value: 0 };
      case "priceMin":
        return { type: "price", field: "priceMin", value: 0 };
      case "condition":
        return { type: "condition", value: "all" };
      case "radiusKm":
        return { type: "radius", value: 10 };
      default:
        return null;
    }
  }

  function chipToRemoveKey(chip: FacetChip): string | null {
    switch (chip.kind) {
      case "vertical":
        return "category";
      case "location":
        return "location";
      case "price":
        return chip.field;
      case "condition":
        return "condition";
      case "radius":
        return "radiusKm";
      case "attribute":
        return chip.field;
      case "keyword":
        // Keyword chips remove into the search box (clearing the current query).
        return null;
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

