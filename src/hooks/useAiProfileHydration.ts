"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiFetchUserPreferences } from "@/lib/api/user-intelligence";
import { userPatchFromPreferences } from "@/lib/ai-preference-profile";
import { isDataApiEnabled } from "@/lib/api/config";

/**
 * After login, load AI Twin preferences into session UserProfile
 * so Magic Mirror / Fleet see real sizes without opening settings.
 */
export function useAiProfileHydration(userId: string | undefined, isAuthenticated: boolean) {
  const { updateUser } = useAuth();
  const hydratedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !userId || userId === "guest") return;
    if (!isDataApiEnabled()) return;
    if (hydratedFor.current === userId) return;
    hydratedFor.current = userId;

    let cancelled = false;
    void apiFetchUserPreferences().then((res) => {
      if (cancelled || !res.ok || !res.data.preferences) return;
      const patch = userPatchFromPreferences(res.data.preferences);
      if (Object.keys(patch).length) updateUser(patch);
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, updateUser, userId]);
}
