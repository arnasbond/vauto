"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useVauto } from "@/context/VautoContext";
import { useAdminGeminiContextState } from "@/hooks/useAdminGeminiContextState";

interface AdminProjectContextValue {
  contextText: string;
  setContextText: (text: string) => void;
  saveContext: () => Promise<boolean>;
  hydrated: boolean;
  saving: boolean;
}

const AdminProjectContext = createContext<AdminProjectContextValue | null>(null);

export function AdminProjectContextProvider({ children }: { children: ReactNode }) {
  const { isAdmin } = useVauto();
  const state = useAdminGeminiContextState();

  const value = useMemo(
    () => ({
      contextText: state.contextText,
      setContextText: state.setContextText,
      saveContext: state.saveContext,
      hydrated: state.hydrated,
      saving: state.saving,
    }),
    [state]
  );

  if (!isAdmin) {
    return <>{children}</>;
  }

  return (
    <AdminProjectContext.Provider value={value}>
      {children}
    </AdminProjectContext.Provider>
  );
}

export function useAdminProjectContext(): AdminProjectContextValue | null {
  return useContext(AdminProjectContext);
}

/** Active context text for agent calls — empty when not admin. */
export function useAdminProjectContextForAgent(): string {
  const ctx = useAdminProjectContext();
  if (!ctx?.contextText.trim()) return "";
  return ctx.contextText.trim();
}
