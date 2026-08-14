"use client";

import { DEAL_STATUS_ORDER, dealStatusLabel } from "@/lib/deal-status";
import { cn } from "@/lib/cn";

export function DealStatusStepper({ status }: { status: string }) {
  const idx = DEAL_STATUS_ORDER.indexOf(
    status as (typeof DEAL_STATUS_ORDER)[number]
  );
  return (
    <ol
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
      aria-label="Sandorio eiga"
      data-deal-status-stepper
    >
      {DEAL_STATUS_ORDER.map((step, i) => {
        const done = idx >= 0 && i <= idx;
        const current = step === status;
        return (
          <li
            key={step}
            className={cn(
              "rounded-xl border px-2 py-2 text-center text-[11px] font-semibold",
              current
                ? "border-[var(--ds-brand)] bg-[var(--ds-brand-soft)] text-[var(--ds-brand)]"
                : done
                  ? "border-[var(--ds-success)]/40 bg-[var(--ds-success-soft)] text-[var(--ds-success)]"
                  : "border-[var(--ds-border-subtle)] text-[var(--ds-text-muted)]"
            )}
            aria-current={current ? "step" : undefined}
            data-status={step}
          >
            {dealStatusLabel(step)}
          </li>
        );
      })}
    </ol>
  );
}
