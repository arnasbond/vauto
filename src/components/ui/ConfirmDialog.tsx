"use client";

import { useVauto } from "@/context/VautoContext";
import { cn } from "@/lib/cn";

export function ConfirmDialog() {
  const { confirmDialog, dismissConfirm } = useVauto();

  if (!confirmDialog) return null;

  const isDanger = confirmDialog.variant === "danger";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] p-5 shadow-xl">
        <h2
          id="confirm-dialog-title"
          className="text-base font-semibold text-[var(--vauto-text-heading)]"
        >
          {confirmDialog.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--vauto-text-muted)]">
          {confirmDialog.message}
        </p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => dismissConfirm(false)}
            className="flex-1 rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-surface-muted)] py-3 text-sm font-semibold text-[var(--vauto-text-main)] transition hover:opacity-90"
          >
            {confirmDialog.cancelLabel ?? "Atšaukti"}
          </button>
          <button
            type="button"
            onClick={() => dismissConfirm(true)}
            className={cn(
              "flex-1 rounded-xl py-3 text-sm font-semibold transition hover:opacity-90",
              isDanger
                ? "bg-[var(--vauto-red,#dc2626)] text-white"
                : "bg-[var(--vauto-primary)] text-[var(--vauto-primary-contrast)]"
            )}
          >
            {confirmDialog.confirmLabel ?? "Patvirtinti"}
          </button>
        </div>
      </div>
    </div>
  );
}
