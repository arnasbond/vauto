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
  normalizeAppTheme,
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

const THEME_COLORS: Record<AppThemeId, string> = {
  light: "#F7F8FB",
  dark: "#0b1220",
};

function applyThemeToDocument(theme: AppThemeId): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.appTheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLORS[theme]);
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppThemeId>(DEFAULT_APP_THEME);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadAppTheme();
    const next = stored && isAppThemeId(stored) ? normalizeAppTheme(stored) : DEFAULT_APP_THEME;
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
