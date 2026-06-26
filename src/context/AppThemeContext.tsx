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
import {
  APP_THEMES,
  DEFAULT_APP_THEME,
  isAppThemeId,
  type AppThemeId,
} from "@/lib/app-theme";
import { loadAppTheme, saveAppTheme } from "@/lib/storage";

interface AppThemeContextValue {
  theme: AppThemeId;
  setTheme: (theme: AppThemeId) => void;
  themes: typeof APP_THEMES;
  hydrated: boolean;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

function applyThemeToDocument(theme: AppThemeId): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.appTheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  const colors: Record<AppThemeId, string> = {
    "vauto-original": "#F4F7FC",
    dark: "#0B0F19",
    "light-minimal": "#FAFAFA",
  };
  if (meta) meta.setAttribute("content", colors[theme]);
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppThemeId>(DEFAULT_APP_THEME);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadAppTheme();
    const next = stored && isAppThemeId(stored) ? stored : DEFAULT_APP_THEME;
    setThemeState(next);
    applyThemeToDocument(next);
    setHydrated(true);
  }, []);

  const setTheme = useCallback((next: AppThemeId) => {
    setThemeState(next);
    saveAppTheme(next);
    applyThemeToDocument(next);
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, themes: APP_THEMES, hydrated }),
    [theme, setTheme, hydrated]
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): AppThemeContextValue {
  const ctx = useContext(AppThemeContext);
  if (!ctx) throw new Error("useAppTheme must be used within AppThemeProvider");
  return ctx;
}
