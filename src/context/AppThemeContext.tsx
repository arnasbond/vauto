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
  APP_THEME_PREFERENCES,
  DEFAULT_APP_THEME,
  DEFAULT_APP_THEME_PREFERENCE,
  normalizeAppThemePreference,
  resolveActiveTheme,
  type AppThemeId,
  type AppThemePreference,
} from "@/lib/app-theme";
import { loadAppTheme, saveAppTheme } from "@/lib/storage";

interface AppThemeContextValue {
  /** The currently ACTIVE/rendered theme — always "light" or "dark". */
  theme: AppThemeId;
  /** The user's SELECTION — "light" | "dark" | "system" (default). */
  preference: AppThemePreference;
  /** Set the user's preference. Passing "system" clears any explicit override. */
  setTheme: (preference: AppThemePreference) => void;
  themes: typeof APP_THEME_PREFERENCES;
  hydrated: boolean;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

const THEME_COLORS: Record<AppThemeId, string> = {
  light: "#F7F8FB",
  dark: "#0b1220",
};

const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

function applyThemeToDocument(theme: AppThemeId): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.appTheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLORS[theme]);
}

/** Reads the OS/browser dark-mode signal. Safe to call on the server (returns false). */
function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia(DARK_MEDIA_QUERY).matches;
  } catch {
    return false;
  }
}

/**
 * Lazy initializer for the ACTIVE theme React state. On the client this
 * reads whatever the zero-FOUC bootstrap script (see `src/app/layout.tsx`)
 * already applied to `<html data-app-theme>` before hydration, so there is
 * no flash and no mismatch. On the server (or if the attribute is somehow
 * absent) it falls back to the static default.
 */
function readInitialActiveTheme(): AppThemeId {
  if (typeof document === "undefined") return DEFAULT_APP_THEME;
  const attr = document.documentElement.dataset.appTheme;
  return attr === "dark" ? "dark" : DEFAULT_APP_THEME;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppThemeId>(readInitialActiveTheme);
  const [preference, setPreferenceState] = useState<AppThemePreference>(
    DEFAULT_APP_THEME_PREFERENCE
  );
  const [hydrated, setHydrated] = useState(false);

  // One-time reconciliation on mount: re-derive preference + active theme
  // from persisted storage (the bootstrap script only ever reads storage,
  // it cannot update React state). This is idempotent with what the
  // bootstrap script already painted, so it never causes a visible flip.
  useEffect(() => {
    const stored = loadAppTheme();
    const pref = normalizeAppThemePreference(stored);
    const active = resolveActiveTheme(pref, systemPrefersDark());
    setPreferenceState(pref);
    setThemeState(active);
    applyThemeToDocument(active);
    setHydrated(true);
  }, []);

  // Live OS-preference tracking (Theme Authority Contract, rule D): only
  // active while the user has NOT made an explicit light/dark choice. Any
  // explicit selection tears this listener down until the user returns to
  // "system".
  useEffect(() => {
    if (preference !== "system") return;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(DARK_MEDIA_QUERY);
    } catch {
      return;
    }
    const handleChange = (event: MediaQueryListEvent) => {
      const next: AppThemeId = event.matches ? "dark" : "light";
      setThemeState(next);
      applyThemeToDocument(next);
    };
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, [preference]);

  const setTheme = useCallback((next: AppThemePreference) => {
    setPreferenceState(next);
    saveAppTheme(next);
    const active = resolveActiveTheme(next, systemPrefersDark());
    setThemeState(active);
    applyThemeToDocument(active);
  }, []);

  const value = useMemo(
    () => ({ theme, preference, setTheme, themes: APP_THEME_PREFERENCES, hydrated }),
    [theme, preference, setTheme, hydrated]
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): AppThemeContextValue {
  const ctx = useContext(AppThemeContext);
  if (!ctx) throw new Error("useAppTheme must be used within AppThemeProvider");
  return ctx;
}
