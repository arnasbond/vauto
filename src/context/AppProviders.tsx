"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { NavigationProvider } from "@/context/NavigationContext";
import { ZeroUiScreenProvider } from "@/context/ZeroUiScreenContext";
import { ReviewsProvider } from "@/context/ReviewsContext";
import { VautoProvider } from "@/context/VautoContext";

/**
 * Application provider tree (Phase 5):
 * AuthProvider → ReviewsProvider → NavigationProvider → ZeroUiScreenProvider → VautoProvider
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ReviewsProvider>
        <NavigationProvider>
          <ZeroUiScreenProvider>
            <VautoProvider>{children}</VautoProvider>
          </ZeroUiScreenProvider>
        </NavigationProvider>
      </ReviewsProvider>
    </AuthProvider>
  );
}
