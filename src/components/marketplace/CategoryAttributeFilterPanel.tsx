"use client";

import {
  categoryFilterFieldsFor,
  countActiveCategoryFilters,
  type CategoryAttributeFilters,
} from "@/lib/category-attribute-filters";
import type { ListingCategory } from "@/lib/types";
import { cn } from "@/lib/cn";

interface CategoryAttributeFilterPanelProps {
  category: ListingCategory | "all";
  filters: CategoryAttributeFilters;
  onChange: (next: CategoryAttributeFilters) => void;
  className?: string;
}

export function CategoryAttributeFilterPanel({
  category,
  filters,
  onChange,
  className,
}: CategoryAttributeFilterPanelProps) {
  const fields = categoryFilterFieldsFor(category);
  if (fields.length === 0) return null;

  const activeCount = countActiveCategoryFilters(filters);

  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700">Chameleon filtrai</p>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="text-[10px] font-medium text-[#1167b1] hover:underline"
          >
            Išvalyti ({activeCount})
          </button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {field.label}
            </span>
            <select
              value={filters[field.key] ?? ""}
              onChange={(e) =>
                onChange({
                  ...filters,
                  [field.key]: e.target.value,
                })
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-[#1167b1]"
            >
              <option value="">Visi</option>
              {field.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}
