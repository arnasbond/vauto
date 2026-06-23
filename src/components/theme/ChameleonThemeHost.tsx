"use client";

import { useEffect, useMemo } from "react";
import { useVauto } from "@/context/VautoContext";
import { getChameleonTheme } from "@/lib/chameleon-themes";
import { portalExperienceForQuery } from "@/lib/portal-experience";

const CHAMELEON_CLASSES = [
  "chameleon-flux",
  "chameleon-autoplius",
  "chameleon-vinted",
  "chameleon-skelbiu",
  "chameleon-aruodas",
  "chameleon-paslaugos",
  "chameleon-cvbankas",
] as const;

/** Applies chameleon body class — seller flow or active search portal */
export function ChameleonThemeHost() {
  const { chameleonTheme, searchQuery, sellerStep } = useVauto();

  const effectiveTheme = useMemo(() => {
    if (sellerStep !== "idle") return chameleonTheme;
    if (searchQuery.trim()) return portalExperienceForQuery(searchQuery).theme;
    return "flux";
  }, [chameleonTheme, searchQuery, sellerStep]);

  const theme = getChameleonTheme(effectiveTheme);

  useEffect(() => {
    const body = document.body;
    body.classList.remove(...CHAMELEON_CLASSES);
    body.classList.add(theme.bodyClass);
    return () => {
      body.classList.remove(theme.bodyClass);
      body.classList.add("chameleon-flux");
    };
  }, [theme.bodyClass]);

  return null;
}
