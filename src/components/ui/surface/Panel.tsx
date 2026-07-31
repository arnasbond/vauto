"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type PanelVariant = "raised" | "nested" | "quiet";
export type PanelTone = "neutral" | "accent" | "danger";
export type PanelPadding = "none" | "sm" | "md" | "lg";

const PADDING: Record<PanelPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
};

const VARIANT: Record<PanelVariant, string> = {
  raised: "",
  nested: "vauto-panel--nested",
  quiet: "vauto-panel--quiet",
};

const TONE: Record<PanelTone, string> = {
  neutral: "",
  accent: "vauto-panel--accent",
  danger: "vauto-panel--danger",
};

export interface PanelProps {
  id?: string;
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  variant?: PanelVariant;
  tone?: PanelTone;
  padding?: PanelPadding;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}

/**
 * The only card shell used across Profilis / Verslas / Control Center.
 * Never nest a `raised` Panel inside another `raised` Panel — use `nested`.
 */
export function Panel({
  id,
  eyebrow,
  title,
  description,
  icon,
  action,
  footer,
  variant = "raised",
  tone = "neutral",
  padding = "md",
  className,
  bodyClassName,
  children,
}: PanelProps) {
  const hasHeader = Boolean(eyebrow || title || description || icon || action);

  return (
    <section
      id={id}
      className={cn("vauto-panel", VARIANT[variant], TONE[tone], PADDING[padding], className)}
    >
      {hasHeader && (
        <header className={cn("flex items-start gap-3", Boolean(children) && "mb-3")}>
          {icon ? (
            <span className="vauto-group-row-icon mt-0.5" aria-hidden>
              {icon}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            {eyebrow ? <p className="vauto-panel-eyebrow">{eyebrow}</p> : null}
            {title ? (
              <h2 className={cn("vauto-panel-title", eyebrow && "mt-0.5")}>{title}</h2>
            ) : null}
            {description ? (
              <p className={cn("vauto-panel-desc", Boolean(title || eyebrow) && "mt-1")}>
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      )}

      {children ? <div className={bodyClassName}>{children}</div> : null}

      {footer ? (
        <footer className="mt-3 border-t border-[var(--vauto-border)] pt-3">{footer}</footer>
      ) : null}
    </section>
  );
}
