"use client";

import type { ReactNode } from "react";
import { AppThemeProvider } from "@/context/AppThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import { NavigationProvider } from "@/context/NavigationContext";
import { ZeroUiScreenProvider } from "@/context/ZeroUiScreenContext";
import { ReviewsProvider } from "@/context/ReviewsContext";
import { VautoProvider } from "@/context/VautoContext";
import { UserBehaviorProvider } from "@/context/UserBehaviorContext";
import { NativeErrorBoundary } from "@/components/NativeErrorBoundary";
import { AppVersionProvider } from "@/context/AppVersionContext";
import { UserBehaviorNavigationTracker } from "@/components/agent/UserBehaviorNavigationTracker";

/**
 * Application provider tree — UserBehaviorProvider feeds global Gemini agent context.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <NativeErrorBoundary>
      <AppVersionProvider>
        <AppThemeProvider>
          <AuthProvider>
            <UserBehaviorProvider>
              <ReviewsProvider>
                <NavigationProvider>
                  <UserBehaviorNavigationTracker />
                  <ZeroUiScreenProvider>
                    <VautoProvider>{children}</VautoProvider>
                  </ZeroUiScreenProvider>
                </NavigationProvider>
              </ReviewsProvider>
            </UserBehaviorProvider>
          </AuthProvider>
        </AppThemeProvider>
      </AppVersionProvider>
    </NativeErrorBoundary>
  );
}
