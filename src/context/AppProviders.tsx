"use client";

import { AuthProvider } from "@/context/AuthContext";
import { VautoProvider } from "@/context/VautoContext";
import type { ReactNode } from "react";

/**
 * Application provider tree (Phase 3 architecture):
 * AuthProvider → VautoProvider (catalog, seller, chat, UI hosts)
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <VautoProvider>{children}</VautoProvider>
    </AuthProvider>
  );
}
