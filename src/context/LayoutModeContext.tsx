"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useIsMobile } from "@/hooks/useIsMobile";

export type LayoutMode = "mobile" | "desktop";

interface LayoutModeContextValue {
  mode: LayoutMode;
  isMobile: boolean;
  isDesktop: boolean;
}

const LayoutModeContext = createContext<LayoutModeContextValue | null>(null);

export function LayoutModeProvider({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile(true);
  const value = useMemo<LayoutModeContextValue>(
    () => ({
      mode: isMobile ? "mobile" : "desktop",
      isMobile,
      isDesktop: !isMobile,
    }),
    [isMobile]
  );

  return (
    <LayoutModeContext.Provider value={value}>
      {children}
    </LayoutModeContext.Provider>
  );
}

export function useLayoutMode(): LayoutModeContextValue {
  const ctx = useContext(LayoutModeContext);
  if (!ctx) {
    throw new Error("useLayoutMode must be used within LayoutModeProvider");
  }
  return ctx;
}
