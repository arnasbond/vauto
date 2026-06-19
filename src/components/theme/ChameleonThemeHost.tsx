"use client";

import { useEffect } from "react";
import { useVauto } from "@/context/VautoContext";
import { getChameleonTheme } from "@/lib/chameleon-themes";

const CHAMELEON_CLASSES = [
  "chameleon-flux",
  "chameleon-autoplius",
  "chameleon-vinted",
  "chameleon-skelbiu",
  "chameleon-aruodas",
] as const;

/** Applies chameleon body class for visual continuity across seller flow */
export function ChameleonThemeHost() {
  const { chameleonTheme } = useVauto();
  const theme = getChameleonTheme(chameleonTheme);

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
