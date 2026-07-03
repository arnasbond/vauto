"use client";

import type { ReactNode } from "react";
import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";

/**
 * Profile/business cabinet shell — adaptive: mobile bottom nav + desktop Anonser chrome.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <VautoAdaptiveLayout variant="plain">
      <div className="vauto-dashboard flex w-full flex-1 flex-col">
        {children}
      </div>
    </VautoAdaptiveLayout>
  );
}
