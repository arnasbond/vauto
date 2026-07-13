"use client";

import type { CategoryFieldDef } from "@/lib/adaptive-categories";
import type { FlowUiSkinTokens } from "@/lib/flow-ui-skin";

interface DynamicAttributeBasketProps {
  fields: CategoryFieldDef[];
  attributes: Record<string, string | string[] | undefined>;
  onChange: (key: string, value: string | string[]) => void;
  missingKeys?: string[];
  skin?: FlowUiSkinTokens;
}

/** AI-extracted attributes — invisible to users; state manager only. */
export function DynamicAttributeBasket(props: DynamicAttributeBasketProps) {
  void props;
  return null;
}
