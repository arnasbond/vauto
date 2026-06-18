"use client";

import { useEffect } from "react";
import { CheckCircle, X } from "lucide-react";
import { useVauto } from "@/context/VautoContext";

export function ToastHost() {
  const { toast, clearToast } = useVauto();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, 3500);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  if (!toast) return null;

  return (
    <div className="safe-bottom pointer-events-none fixed bottom-24 left-0 right-0 z-[300] flex justify-center px-4">
      <div
        className={`pointer-events-auto flex max-w-sm items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-xl ${
          toast.type === "success"
            ? "bg-emerald-600 text-white"
            : toast.type === "error"
              ? "bg-red-600 text-white"
              : "bg-slate-800 text-white ring-1 ring-white/10"
        }`}
      >
        {toast.type === "success" && <CheckCircle className="h-4 w-4 shrink-0" />}
        <span className="flex-1">{toast.message}</span>
        <button
          type="button"
          onClick={clearToast}
          className="shrink-0 rounded p-0.5 opacity-80 hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
