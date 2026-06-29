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
      setSnapshot(
        evaluateAppVersion(null, null, isNativeShell, message)
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (!isNativeApp()) return;
    const retry = window.setTimeout(() => void refresh(), 1200);
    return () => window.clearTimeout(retry);
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
