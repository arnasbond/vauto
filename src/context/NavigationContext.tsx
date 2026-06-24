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
import { usePathname } from "next/navigation";
import {
  APP_VIEW_LABELS,
  pathToView,
  type AppView,
  type ViewParams,
} from "@/lib/app-views";

export type NavigationSource = "agent" | "user" | "pathname";

export interface NavigateOptions {
  source?: NavigationSource;
  /** When true (default for agent), hides BottomNav and shows Zero-UI overlay. */
  zeroUi?: boolean;
}

export interface NavigationContextValue {
  currentView: AppView;
  viewParams: ViewParams;
  viewHistory: AppView[];
  zeroUiActive: boolean;
  lastNavigationSource: NavigationSource | null;
  navigateTo: (view: AppView, params?: ViewParams, options?: NavigateOptions) => void;
  exitZeroUi: () => void;
  goBack: () => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [currentView, setCurrentView] = useState<AppView>(() => pathToView(pathname));
  const [viewParams, setViewParams] = useState<ViewParams>({});
  const [viewHistory, setViewHistory] = useState<AppView[]>([]);
  const [zeroUiActive, setZeroUiActive] = useState(false);
  const [lastNavigationSource, setLastNavigationSource] =
    useState<NavigationSource | null>(null);

  useEffect(() => {
    if (zeroUiActive) return;
    const fromPath = pathToView(pathname);
    setCurrentView(fromPath);
    setViewParams({});
    setLastNavigationSource("pathname");
  }, [pathname, zeroUiActive]);

  const navigateTo = useCallback(
    (view: AppView, params: ViewParams = {}, options: NavigateOptions = {}) => {
      const source = options.source ?? "user";
      const enableZeroUi = options.zeroUi ?? source === "agent";

      setCurrentView((prev) => {
        if (prev !== view) {
          setViewHistory((h) => [...h.slice(-7), prev]);
        }
        return view;
      });
      setViewParams(params);
      setLastNavigationSource(source);
      if (enableZeroUi) setZeroUiActive(true);
    },
    []
  );

  const exitZeroUi = useCallback(() => {
    setZeroUiActive(false);
    const fromPath = pathToView(pathname);
    setCurrentView(fromPath);
    setViewParams({});
    setLastNavigationSource("user");
  }, [pathname]);

  const goBack = useCallback(() => {
    setViewHistory((h) => {
      const prev = h[h.length - 1];
      if (!prev) {
        exitZeroUi();
        return h;
      }
      setCurrentView(prev);
      setViewParams({});
      return h.slice(0, -1);
    });
  }, [exitZeroUi]);

  const value = useMemo<NavigationContextValue>(
    () => ({
      currentView,
      viewParams,
      viewHistory,
      zeroUiActive,
      lastNavigationSource,
      navigateTo,
      exitZeroUi,
      goBack,
    }),
    [
      currentView,
      viewParams,
      viewHistory,
      zeroUiActive,
      lastNavigationSource,
      navigateTo,
      exitZeroUi,
      goBack,
    ]
  );

  return (
    <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error("useNavigation must be used within NavigationProvider");
  }
  return ctx;
}

export function useNavigationOptional(): NavigationContextValue | null {
  return useContext(NavigationContext);
}

export function viewTitle(view: AppView): string {
  return APP_VIEW_LABELS[view];
}
