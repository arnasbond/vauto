"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface DisclosureProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** Progressive disclosure for secondary/rarely used blocks. */
export function Disclosure({
  title,
  subtitle,
  icon,
  defaultOpen = false,
  children,
  className,
  bodyClassName,
}: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={cn("vauto-panel overflow-hidden", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="vauto-group-row vauto-group-row--interactive"
      >
        {icon ? (
          <span className="vauto-group-row-icon" aria-hidden>
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="vauto-panel-title block">{title}</span>
          {subtitle ? (
            <span className="vauto-panel-desc mt-0.5 block">{subtitle}</span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[var(--vauto-text-muted)] transition-transform duration-200",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          className={cn(
            "space-y-3 border-t border-[var(--vauto-border)] p-4",
            bodyClassName
          )}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
