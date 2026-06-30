"use client";

import type { CategoryFieldDef } from "@/lib/adaptive-categories";
import { CategoryFieldsEditor } from "@/components/adaptive-confirmation/CategoryFieldsEditor";
import type { FlowUiSkinTokens } from "@/lib/flow-ui-skin";
import { cn } from "@/lib/cn";

interface DynamicAttributeBasketProps {
  fields: CategoryFieldDef[];
  attributes: Record<string, string | string[] | undefined>;
  onChange: (key: string, value: string | string[]) => void;
  missingKeys?: string[];
  skin?: FlowUiSkinTokens;
}

/** AI-extracted attributes not covered by the static schema — universal basket rows. */
export function DynamicAttributeBasket({
  fields,
  attributes,
  onChange,
  missingKeys = [],
  skin,
}: DynamicAttributeBasketProps) {
  if (!fields.length) return null;

  const isSpinta = skin?.variant === "spinta";

  return (
    <div
      className={cn(
        "mb-4 rounded-2xl border p-4",
        isSpinta ? "border-fuchsia-500/25 bg-[#131c38]" : "border-sky-500/25 bg-[#131c38]"
      )}
    >
      <p
        className={cn(
          "mb-3 text-xs font-semibold uppercase tracking-wide",
          isSpinta ? "text-fuchsia-300" : "text-sky-300"
        )}
      >
        AI išgauti atributai
      </p>
      <CategoryFieldsEditor
        fields={fields}
        attributes={attributes}
        onChange={onChange}
        layout="stack"
        missingKeys={missingKeys}
        variant="inline"
        appearance="light"
      />
    </div>
  );
}
