"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface ProfileAccordionProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function ProfileAccordion({
  title,
  subtitle,
  icon,
  defaultOpen = false,
  children,
}: ProfileAccordionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="vauto-dashboard-card mt-4 overflow-hidden rounded-2xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-[color-mix(in_srgb,var(--vauto-primary)_6%,transparent)]"
        aria-expanded={open}
      >
        {icon}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-[var(--vauto-text-main)]">{title}</h3>
          {subtitle ? (
            <p className="text-[10px] text-[var(--vauto-text-muted)]">{subtitle}</p>
          ) : null}
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-[var(--vauto-text-muted)] transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>
      {open ? (
        <div className="space-y-4 border-t border-[var(--vauto-border)] px-4 pb-4 pt-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}
