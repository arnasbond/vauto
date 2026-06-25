"use client";

import { useCallback, useState } from "react";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";

/** Portal „Ieškoti“ mygtukas — loading + greitoji paieška per agentą */
export function usePortalSearchSubmit() {
  const { setSearchQuery, setSearchLoading, setSearchInputMode } = useVauto();
  const { sendAgentMessage } = useVautoAgent();
  const [busy, setBusy] = useState(false);

  const submitSearch = useCallback(
    async (query: string) => {
      const q = query.trim();
      if (!q || busy) return;
      setBusy(true);
      setSearchLoading(true);
      setSearchInputMode("text");
      try {
        setSearchQuery(q);
        await sendAgentMessage(q, { skipBusyCheck: true });
      } finally {
        setBusy(false);
        setSearchLoading(false);
      }
    },
    [busy, sendAgentMessage, setSearchInputMode, setSearchLoading, setSearchQuery]
  );

  return { submitSearch, busy };
}
