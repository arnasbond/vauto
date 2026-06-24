"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useVauto } from "@/context/VautoContext";
import {
  apiFetchAdminProjectContext,
  apiSaveAdminProjectContext,
} from "@/lib/api/client";
import {
  loadAdminProjectContextFromStorage,
  saveAdminProjectContextToStorage,
} from "@/lib/admin-agent-context";

interface AdminProjectContextValue {
  contextText: string;
  setContextText: (text: string) => void;
  saveContext: () => Promise<boolean>;
  hydrated: boolean;
  saving: boolean;
}

const AdminProjectContext = createContext<AdminProjectContextValue | null>(null);

export function AdminProjectContextProvider({ children }: { children: ReactNode }) {
  const { isAdmin, apiActive } = useVauto();
  const [contextText, setContextTextState] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      setContextTextState("");
      setHydrated(true);
      return;
    }

    const local = loadAdminProjectContextFromStorage();
    setContextTextState(local);

    if (!apiActive) {
      setHydrated(true);
      return;
    }

    void apiFetchAdminProjectContext().then((res) => {
      if (res?.ok && typeof res.data.context === "string") {
        setContextTextState(res.data.context);
        saveAdminProjectContextToStorage(res.data.context);
      }
      setHydrated(true);
    });
  }, [isAdmin, apiActive]);

  const setContextText = useCallback((text: string) => {
    setContextTextState(text);
  }, []);

  const saveContext = useCallback(async () => {
    if (!isAdmin) return false;
    setSaving(true);
    const localSaved = saveAdminProjectContextToStorage(contextText);
    setContextTextState(localSaved);

    if (apiActive) {
      const res = await apiSaveAdminProjectContext(localSaved);
      setSaving(false);
      return res?.ok ?? false;
    }

    setSaving(false);
    return true;
  }, [isAdmin, apiActive, contextText]);

  const value = useMemo(
    () => ({
      contextText,
      setContextText,
      saveContext,
      hydrated,
      saving,
    }),
    [contextText, setContextText, saveContext, hydrated, saving]
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
