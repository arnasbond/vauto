"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import {
  resolveFlowUiSkin,
  type FlowUiSkinTokens,
} from "@/lib/flow-ui-skin";
import { listingToAdaptiveKey } from "@/lib/adaptive-categories";

/** Resolves active UI skin from universal data + optional Spinta route context. */
export function useFlowUiSkin(): FlowUiSkinTokens {
  const pathname = usePathname();
  const { aiDraft, wardrobeSpintaForced, sellerStep } = useVauto();

  return useMemo(() => {
    const fashionRoute =
      pathname === "/fashion" ||
      pathname === "/fashion/" ||
      pathname.startsWith("/fashion/") ||
      (typeof window !== "undefined" &&
        window.location.search.includes("vertical=fashion"));

    const category =
      sellerStep !== "idle" && aiDraft?.category
        ? listingToAdaptiveKey(aiDraft.category)
        : wardrobeSpintaForced || fashionRoute
          ? "clothing"
          : aiDraft?.category
            ? listingToAdaptiveKey(aiDraft.category)
            : null;

    return resolveFlowUiSkin({
      category: category === "clothing" ? "clothing" : aiDraft?.category ?? null,
      wardrobeSpintaForced,
      fashionRoute,
    });
  }, [aiDraft?.category, wardrobeSpintaForced, sellerStep, pathname]);
}
