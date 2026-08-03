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
import { Capacitor } from "@capacitor/core";
import { isNativeApp } from "@/lib/mobile-install";
import { initDataApiConfig } from "@/lib/api/config";
import {
  evaluateAppVersion,
  fetchVersionConfig,
  resolveNativeAppVersion,
  type AppVersionSnapshot,
} from "@/lib/app-version";

interface AppVersionContextValue extends AppVersionSnapshot {
  refresh: () => Promise<void>;
}

const AppVersionContext = createContext<AppVersionContextValue | null>(null);

/** Re-check while native shell is open so users see new APK releases. */
const NATIVE_POLL_MS = 30 * 60 * 1000;

export function AppVersionProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<AppVersionSnapshot>({
    status: "loading",
    isNativeShell: false,
    remote: null,
    local: null,
  });

  const refresh = useCallback(async () => {
    const isNativeShell = isNativeApp();
    try {
      await initDataApiConfig();
      const [remote, local] = await Promise.all([
        fetchVersionConfig(),
        resolveNativeAppVersion(),
      ]);
      setSnapshot(evaluateAppVersion(remote, local, isNativeShell));
    } catch (e) {
      const message = e instanceof Error ? e.message : "version check failed";
      console.error("[VAUTO version]", message);
      setSnapshot(evaluateAppVersion(null, null, isNativeShell, message));
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (!isNativeApp()) return;

    const retry = window.setTimeout(() => void refresh(), 1200);
    const poll = window.setInterval(() => void refresh(), NATIVE_POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    let removeAppListener: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      void import("@capacitor/app").then(({ App }) => {
        const handle = App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) void refresh();
        });
        void handle.then((l) => {
          removeAppListener = () => {
            void l.remove();
          };
        });
      });
    }

    return () => {
      window.clearTimeout(retry);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      removeAppListener?.();
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ ...snapshot, refresh }),
    [snapshot, refresh]
  );

  return (
    <AppVersionContext.Provider value={value}>
      {children}
    </AppVersionContext.Provider>
  );
}

export function useAppVersion(): AppVersionContextValue {
  const ctx = useContext(AppVersionContext);
  if (!ctx) {
    throw new Error("useAppVersion must be used within AppVersionProvider");
  }
  return ctx;
}

/** Safe hook for optional consumers outside provider (should not happen). */
export function useAppVersionOptional(): AppVersionContextValue | null {
  return useContext(AppVersionContext);
}
