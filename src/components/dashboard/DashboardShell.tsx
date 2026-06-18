"use client";

import type { ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";
import { SyncErrorBanner } from "@/components/SyncErrorBanner";

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="vauto-dashboard flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-28 pt-4">
        <SyncErrorBanner />
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
