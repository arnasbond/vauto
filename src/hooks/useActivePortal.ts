"use client";

import { useMemo } from "react";
import { useVauto } from "@/context/VautoContext";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import { portalExperienceForQuery } from "@/lib/portal-experience";
import type { ChameleonThemeId } from "@/lib/chameleon-themes";

export function useActivePortal() {
  const { searchQuery, sellerStep, chameleonTheme } = useVauto();
  const theme: ChameleonThemeId =
    sellerStep !== "idle"
      ? chameleonTheme
      : portalExperienceForQuery(searchQuery).theme;
  const ui = useMemo(() => getPortalUi(theme), [theme]);
  const experience = useMemo(
    () => portalExperienceForQuery(searchQuery),
    [searchQuery]
  );
  return { theme, ui, experience, searchQuery };
}
