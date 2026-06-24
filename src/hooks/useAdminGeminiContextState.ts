"use client";

import { useCallback, useEffect, useState } from "react";
import { useVauto } from "@/context/VautoContext";
import {
  apiFetchAdminProjectContext,
  apiSaveAdminProjectContext,
} from "@/lib/api/client";
import {
  loadAdminProjectContextFromStorage,
  saveAdminProjectContextToStorage,
} from "@/lib/admin-agent-context";

export function useAdminGeminiContextState() {
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

  return {
    isAdmin,
    contextText,
    setContextText,
    saveContext,
    hydrated,
    saving,
  };
}
