"use client";

import type { CategoryFieldDef } from "@/lib/adaptive-categories";
import { CategoryFieldsEditor } from "@/components/adaptive-confirmation/CategoryFieldsEditor";

interface DynamicAttributeBasketProps {
  fields: CategoryFieldDef[];
  attributes: Record<string, string | string[] | undefined>;
  onChange: (key: string, value: string | string[]) => void;
  missingKeys?: string[];
}

/** AI-extracted attributes not covered by the static schema — universal basket rows. */
export function DynamicAttributeBasket({
  fields,
  attributes,
  onChange,
  missingKeys = [],
}: DynamicAttributeBasketProps) {
  if (!fields.length) return null;

  return (
    <div className="mb-4 rounded-2xl border border-sky-500/25 bg-[#131c38] p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-sky-300">
        AI išgauti atributai
      </p>
      <CategoryFieldsEditor
        fields={fields}
        attributes={attributes}
        onChange={onChange}
        layout="stack"
        missingKeys={missingKeys}
        variant="inline"
      />
    </div>
  );
}
