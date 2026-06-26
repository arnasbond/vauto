"use client";

import { ChevronDown } from "lucide-react";
import type { ListingCategory } from "@/lib/types";
import { MOCK_CATEGORY_LABELS } from "@/data/mockListings";

const CATEGORY_OPTIONS: ListingCategory[] = [
  "vehicles",
  "real_estate",
  "clothing",
  "electronics",
  "home",
  "services",
  "jobs",
  "other",
];

interface WizardCategoryPickerProps {
  category: ListingCategory;
  onChange: (category: ListingCategory) => void;
}

export function WizardCategoryPicker({
  category,
  onChange,
}: WizardCategoryPickerProps) {
  return (
    <div className="sticky top-0 z-20 border-b border-[var(--vauto-border)] bg-[var(--vauto-card-bg,#fff)] px-4 py-3">
      <label
        htmlFor="wizard-category-select"
        className="mb-1.5 block text-xs font-semibold text-[var(--vauto-text-muted)]"
      >
        Kategorija (galite pakeisti)
      </label>
      <div className="relative">
        <select
          id="wizard-category-select"
          value={category}
          onChange={(e) => onChange(e.target.value as ListingCategory)}
          className="wizard-category-select w-full appearance-none rounded-xl px-3 py-2.5 pr-10 text-sm font-semibold outline-none ring-1 ring-[var(--vauto-border)] focus:ring-2 focus:ring-[var(--vauto-accent)]"
        >
          {CATEGORY_OPTIONS.map((id) => (
            <option key={id} value={id}>
              {MOCK_CATEGORY_LABELS[id]}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--vauto-text-muted)]" />
      </div>
    </div>
  );
}
