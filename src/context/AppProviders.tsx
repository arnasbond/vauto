"use client";

import type { ReactNode } from "react";
import { AppThemeProvider } from "@/context/AppThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import { NavigationProvider } from "@/context/NavigationContext";
import { ZeroUiScreenProvider } from "@/context/ZeroUiScreenContext";
import { ReviewsProvider } from "@/context/ReviewsContext";
import { VautoSearchProvider } from "@/context/VautoSearchContext";
import { VautoProvider } from "@/context/VautoContext";
import { UserBehaviorProvider } from "@/context/UserBehaviorContext";
import { LayoutModeProvider } from "@/context/LayoutModeContext";
import { NativeErrorBoundary } from "@/components/NativeErrorBoundary";
import { AppVersionProvider } from "@/context/AppVersionContext";
import { WebAutoUpdateHost } from "@/components/version/WebAutoUpdateHost";
import { UserBehaviorNavigationTracker } from "@/components/agent/UserBehaviorNavigationTracker";
import { ApiWarmupHost } from "@/components/ApiWarmupHost";

/**
 * Application provider tree — UserBehaviorProvider feeds global Gemini agent context.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <NativeErrorBoundary>
      <AppVersionProvider>
        <WebAutoUpdateHost />
        <ApiWarmupHost />
        <AppThemeProvider>
          <LayoutModeProvider>
            <AuthProvider>
            <UserBehaviorProvider>
              <ReviewsProvider>
                <NavigationProvider>
                  <UserBehaviorNavigationTracker />
                  <ZeroUiScreenProvider>
                    <VautoSearchProvider>
                      <VautoProvider>{children}</VautoProvider>
                    </VautoSearchProvider>
                  </ZeroUiScreenProvider>
                </NavigationProvider>
              </ReviewsProvider>
            </UserBehaviorProvider>
            </AuthProvider>
          </LayoutModeProvider>
        </AppThemeProvider>
      </AppVersionProvider>
    </NativeErrorBoundary>
  );
}
