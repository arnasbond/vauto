"use client";

import { useEffect, useMemo, useRef } from "react";
import { useVauto } from "@/context/VautoContext";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { useVautoSearch } from "@/context/VautoSearchContext";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import { getVerticalPresentation } from "@/lib/vertical-presentation";
import { getVerticalUi } from "@/lib/vertical-presentation";
import { verticalExperienceForQuery } from "@/lib/vertical-presentation";
import type { VerticalPresentationId } from "@/lib/vertical-presentation";

const VERTICAL_BODY_CLASSES = [
  "chameleon-flux",
  "chameleon-wardrobe",
] as const;

/**
 * Applies the active vertical body class — seller flow or active search query.
 * Stage 20B.1 — every vertical renders under the single VAUTO DS 2.0 identity;
 * only the fashion (Spinta) flow keeps its dedicated wardrobe body class.
 */
export function ChameleonThemeHost() {
  const { chameleonTheme } = useVauto();
  const { sellerStep } = useSellerFlow();
  const { searchQuery } = useVautoSearch();
  const { trackEvent } = useUserBehavior();
  const lastThemeRef = useRef<string | null>(null);

  const effectiveVertical = useMemo<VerticalPresentationId | null>(() => {
    if (sellerStep !== "idle") {
      return chameleonTheme === "wardrobe" ? "fashion" : "marketplace";
    }
    if (chameleonTheme === "wardrobe") return "fashion";
    if (searchQuery.trim()) return verticalExperienceForQuery(searchQuery).vertical;
    return null;
  }, [chameleonTheme, searchQuery, sellerStep]);

  const theme = effectiveVertical
    ? getVerticalPresentation(effectiveVertical)
    : null;

  useEffect(() => {
    if (effectiveVertical === lastThemeRef.current) return;
    lastThemeRef.current = effectiveVertical;
    trackEvent("theme_change", {
      theme: effectiveVertical,
      chameleonTheme,
      sellerStep,
    });
  }, [effectiveVertical, chameleonTheme, sellerStep, trackEvent]);

  useEffect(() => {
    const body = document.body;
    body.classList.remove(...VERTICAL_BODY_CLASSES);
    if (!theme) return;
    body.classList.add(theme.bodyClass);
    return () => {
      body.classList.remove(theme.bodyClass);
    };
  }, [theme]);

  useEffect(() => {
    if (!effectiveVertical) return;
    const ui = getVerticalUi(effectiveVertical);
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", ui.bannerBg);
  }, [effectiveVertical]);

  return null;
}
