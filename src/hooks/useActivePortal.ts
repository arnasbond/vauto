"use client";

import { useMemo } from "react";
import { useVauto } from "@/context/VautoContext";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { useVautoSearch } from "@/context/VautoSearchContext";
import { getVerticalUi } from "@/lib/vertical-presentation";
import { verticalExperienceForQuery } from "@/lib/vertical-presentation";
import type { VerticalPresentationId } from "@/lib/vertical-presentation";

/**
 * Active vertical presentation for the current seller-flow / search state
 * (Stage 20B.1 — VAUTO-native, no portal imitation).
 */
export function useActiveVertical() {
  const { chameleonTheme } = useVauto();
  const { sellerStep } = useSellerFlow();
  const { searchQuery } = useVautoSearch();
  const vertical: VerticalPresentationId =
    sellerStep !== "idle"
      ? chameleonTheme === "wardrobe"
        ? "fashion"
        : "marketplace"
      : verticalExperienceForQuery(searchQuery).vertical;
  const ui = useMemo(() => getVerticalUi(vertical), [vertical]);
  const experience = useMemo(
    () => verticalExperienceForQuery(searchQuery),
    [searchQuery]
  );
  return { vertical, ui, experience, searchQuery };
}
