"use client";

import { AlertCircle, X } from "lucide-react";
import { useVauto } from "@/context/VautoContext";

export function SyncErrorBanner() {
  const { syncError, clearSyncError } = useVauto();
  if (!syncError) return null;

  return (
    <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="flex-1">{syncError}</p>
      <button
        type="button"
        onClick={clearSyncError}
        className="shrink-0 rounded p-0.5 hover:bg-red-100"
        aria-label="Uždaryti"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
