"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SettingsGroupProps {
  label?: string;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}

/** Grouped settings list — replaces stacks of one-control cards. */
export function SettingsGroup({
  label,
  children,
  className,
  ariaLabel,
}: SettingsGroupProps) {
  return (
    <section className={className}>
      {label ? <p className="vauto-group-label">{label}</p> : null}
      <nav className="vauto-group" aria-label={ariaLabel ?? label}>
        {children}
      </nav>
    </section>
  );
}

interface SettingsRowProps {
  icon?: ReactNode;
  label: string;
  hint?: string;
  href?: string;
  onClick?: () => void;
  trailing?: ReactNode;
}

export function SettingsRow({
  icon,
  label,
  hint,
  href,
  onClick,
  trailing,
}: SettingsRowProps) {
  const interactive = Boolean(href || onClick);

  const inner = (
    <>
      {icon ? (
        <span className="vauto-group-row-icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-[var(--vauto-text-main)]">
          {label}
        </span>
        {hint ? (
          <span className="mt-0.5 block text-xs text-[var(--vauto-text-muted)]">
            {hint}
          </span>
        ) : null}
      </span>
      {trailing ?? null}
      {interactive && !trailing ? (
        <ChevronRight
          className="h-4 w-4 shrink-0 text-[var(--vauto-text-muted)]"
          aria-hidden
        />
      ) : null}
    </>
  );

  const className = cn(
    "vauto-group-row",
    interactive && "vauto-group-row--interactive"
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {inner}
      </button>
    );
  }

  return <div className={className}>{inner}</div>;
}

/** Row that hosts an inline control (toggle, swatches) instead of navigation. */
export function SettingsControlRow({
  icon,
  label,
  hint,
  children,
}: {
  icon?: ReactNode;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="vauto-group-row flex-col items-stretch gap-3 sm:flex-row sm:items-center">
      <span className="flex min-w-0 flex-1 items-center gap-3">
        {icon ? (
          <span className="vauto-group-row-icon" aria-hidden>
            {icon}
          </span>
        ) : null}
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[var(--vauto-text-main)]">
            {label}
          </span>
          {hint ? (
            <span className="mt-0.5 block text-xs text-[var(--vauto-text-muted)]">
              {hint}
            </span>
          ) : null}
        </span>
      </span>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
