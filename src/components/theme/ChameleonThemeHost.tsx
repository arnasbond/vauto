"use client";

import { useEffect, useMemo, useRef } from "react";
import { useVauto } from "@/context/VautoContext";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import { getChameleonTheme } from "@/lib/chameleon-themes";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import { portalExperienceForQuery } from "@/lib/portal-experience";

const CHAMELEON_CLASSES = [
  "chameleon-flux",
  "chameleon-autoplius",
  "chameleon-wardrobe",
  "chameleon-skelbiu",
  "chameleon-aruodas",
  "chameleon-paslaugos",
  "chameleon-cvbankas",
] as const;

/** Applies chameleon body class — seller flow or active search portal */
export function ChameleonThemeHost() {
  const { chameleonTheme, searchQuery, sellerStep } = useVauto();
  const { trackEvent } = useUserBehavior();
  const lastThemeRef = useRef<string | null>(null);

  const effectiveTheme = useMemo(() => {
    if (sellerStep !== "idle") return chameleonTheme;
    if (searchQuery.trim()) return portalExperienceForQuery(searchQuery).theme;
    return "flux";
  }, [chameleonTheme, searchQuery, sellerStep]);

  const theme = getChameleonTheme(effectiveTheme);

  useEffect(() => {
    if (effectiveTheme === lastThemeRef.current) return;
    lastThemeRef.current = effectiveTheme;
    trackEvent("theme_change", { theme: effectiveTheme, chameleonTheme, sellerStep });
  }, [effectiveTheme, chameleonTheme, sellerStep, trackEvent]);

  useEffect(() => {
    const body = document.body;
    body.classList.remove(...CHAMELEON_CLASSES);
    body.classList.add(theme.bodyClass);
    return () => {
      body.classList.remove(theme.bodyClass);
    };
  }, [theme.bodyClass]);

  useEffect(() => {
    const ui = getPortalUi(effectiveTheme);
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", ui.bannerBg);
  }, [effectiveTheme]);

  return null;
}
