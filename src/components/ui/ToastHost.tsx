"use client";

import { useEffect } from "react";
import { CheckCircle, Sparkles, X } from "lucide-react";
import { useVauto } from "@/context/VautoContext";

export function ToastHost() {
  const { toast, clearToast } = useVauto();

  useEffect(() => {
    if (!toast) return;
    const duration = toast.type === "buddy" ? 7000 : 3500;
    const t = setTimeout(clearToast, duration);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  if (!toast) return null;

  const isBuddy = toast.type === "buddy";

  return (
    <div className="safe-bottom pointer-events-none fixed bottom-24 left-0 right-0 z-[300] flex justify-center px-4">
      <div
        className={`pointer-events-auto flex max-w-sm items-start gap-3 rounded-2xl px-4 py-3.5 text-sm font-medium shadow-xl ${
          toast.type === "success"
            ? "bg-emerald-600 text-white"
            : toast.type === "error"
              ? "bg-red-600 text-white"
              : isBuddy
                ? "bg-gradient-to-br from-[var(--vauto-teal)]/90 to-[var(--flux-indigo)]/90 text-white ring-1 ring-[var(--vauto-teal)]/40"
                : "bg-slate-800 text-white ring-1 ring-white/10"
        }`}
      >
        {toast.type === "success" && <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />}
        {isBuddy && <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--vauto-orange)]" />}
        <span className="flex-1 leading-snug">{toast.message}</span>
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
