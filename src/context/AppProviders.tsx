"use client";

import { AuthProvider } from "@/context/AuthContext";
import { ReviewsProvider } from "@/context/ReviewsContext";
import { VautoProvider } from "@/context/VautoContext";
import type { ReactNode } from "react";

/**
 * Application provider tree (Phase 5):
 * AuthProvider → ReviewsProvider → VautoProvider
 *   └─ Moderation → PushAlerts → WakeWord → VautoBridge → Chat → SellerFlow → VautoFacade
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ReviewsProvider>
        <VautoProvider>{children}</VautoProvider>
      </ReviewsProvider>
    </AuthProvider>
  );
}
