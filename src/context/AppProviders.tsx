"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { NavigationProvider } from "@/context/NavigationContext";
import { ReviewsProvider } from "@/context/ReviewsContext";
import { VautoProvider } from "@/context/VautoContext";

/**
 * Application provider tree (Phase 5):
 * AuthProvider → ReviewsProvider → NavigationProvider → VautoProvider
 *   └─ Moderation → PushAlerts → WakeWord → VautoBridge → Chat → SellerFlow → VautoFacade
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ReviewsProvider>
        <NavigationProvider>
          <VautoProvider>{children}</VautoProvider>
        </NavigationProvider>
      </ReviewsProvider>
    </AuthProvider>
  );
}
