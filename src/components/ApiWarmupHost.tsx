"use client";

import { useEffect } from "react";
import { apiAiHealthCheck, apiHealthCheck } from "@/lib/api/client";
import { initDataApiConfig } from "@/lib/api/config";

/** Silently wakes the Render API before the first user-initiated AI turn. */
export function ApiWarmupHost() {
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await initDataApiConfig();
          if (cancelled) return;
          void apiHealthCheck();
          void apiAiHealthCheck();
        } catch {
          /* best effort only */
        }
      })();
    }, 650);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}
