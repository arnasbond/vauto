"use client";

import { useVauto } from "@/context/VautoContext";

export function ConfirmDialog() {
  const { confirmDialog, dismissConfirm } = useVauto();

  if (!confirmDialog) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1a1f2e] p-5 shadow-xl">
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-white">
          {confirmDialog.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          {confirmDialog.message}
        </p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => dismissConfirm(false)}
            className="flex-1 rounded-xl border border-white/15 py-3 text-sm font-semibold text-slate-300"
          >
            {confirmDialog.cancelLabel ?? "Atšaukti"}
          </button>
          <button
            type="button"
            onClick={() => dismissConfirm(true)}
            className="flex-1 rounded-xl bg-[var(--vauto-teal)] py-3 text-sm font-semibold text-[#0b0f17]"
          >
            {confirmDialog.confirmLabel ?? "Patvirtinti"}
          </button>
        </div>
      </div>
    </div>
  );
}
