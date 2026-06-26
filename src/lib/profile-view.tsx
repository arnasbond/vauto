"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ProfileViewMode = "private" | "business";

const KEY = "vauto_profile_view_v1";

interface ProfileViewContextValue {
  viewMode: ProfileViewMode;
  setViewMode: (mode: ProfileViewMode) => void;
  showBusinessUi: (isPro: boolean) => boolean;
}

const ProfileViewContext = createContext<ProfileViewContextValue | null>(null);

function readMode(): ProfileViewMode {
  if (typeof window === "undefined") return "business";
  try {
    const raw = localStorage.getItem(KEY);
    return raw === "private" ? "private" : "business";
  } catch {
    return "business";
  }
}

export function ProfileViewProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewModeState] = useState<ProfileViewMode>("business");

  useEffect(() => {
    setViewModeState(readMode());
  }, []);

  const setViewMode = useCallback((mode: ProfileViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* ignore */
    }
  }, []);

  const showBusinessUi = useCallback(
    (isPro: boolean) => isPro && viewMode === "business",
    [viewMode]
  );

  const value = useMemo(
    () => ({ viewMode, setViewMode, showBusinessUi }),
    [viewMode, setViewMode, showBusinessUi]
  );

  return (
    <ProfileViewContext.Provider value={value}>{children}</ProfileViewContext.Provider>
  );
}

export function useProfileViewMode(isPro = false) {
  const ctx = useContext(ProfileViewContext);
  if (!ctx) {
    return {
      viewMode: "business" as ProfileViewMode,
      setViewMode: () => {},
      showBusinessUi: isPro,
    };
  }
  return {
    viewMode: ctx.viewMode,
    setViewMode: ctx.setViewMode,
    showBusinessUi: ctx.showBusinessUi(isPro),
  };
}
