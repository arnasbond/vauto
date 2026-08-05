import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../utils";
import { Button } from "./Button";

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  rounded?: "control" | "card" | "full";
};

export function Skeleton({
  className,
  rounded = "control",
  ...rest
}: SkeletonProps) {
  const r =
    rounded === "full"
      ? "rounded-[var(--ds-radius-full)]"
      : rounded === "card"
        ? "rounded-[var(--ds-radius-card)]"
        : "rounded-[var(--ds-radius-control)]";
  return (
    <div
      aria-hidden
      className={cn("ds-shimmer", r, className)}
      {...rest}
    />
  );
}

export type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--ds-radius-panel)] border border-dashed border-[var(--ds-border-strong)] bg-[var(--ds-surface-muted)] px-6 py-12 text-center",
        className
      )}
    >
      {icon ? (
        <div className="mb-3 text-[var(--ds-text-muted)]">{icon}</div>
      ) : null}
      <h3 className="ds-h3 text-[length:1.25rem]">{title}</h3>
      {description ? (
        <p className="ds-body-sm mt-2 max-w-sm">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <Button className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 border-b border-[var(--ds-border-subtle)] pb-5 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div>
        <h1 className="ds-h1">{title}</h1>
        {description ? (
          <p className="ds-body mt-2 max-w-2xl">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export type SectionHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function SectionHeader({
  title,
  description,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div>
        <h2 className="ds-h2 text-[length:var(--ds-text-h3-size)]">{title}</h2>
        {description ? <p className="ds-body-sm mt-1">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  trend?: "up" | "down" | "flat";
  className?: string;
};

export function StatCard({
  label,
  value,
  hint,
  trend,
  className,
}: StatCardProps) {
  const trendColor =
    trend === "up"
      ? "text-[var(--ds-success)]"
      : trend === "down"
        ? "text-[var(--ds-danger)]"
        : "text-[var(--ds-text-muted)]";
  return (
    <div
      className={cn(
        "rounded-[var(--ds-radius-card)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] p-4 shadow-[var(--ds-shadow-xs)]",
        className
      )}
    >
      <p className="ds-label text-[var(--ds-text-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--ds-text-primary)]">
        {value}
      </p>
      {hint ? (
        <p className={cn("ds-caption mt-1", trendColor)}>{hint}</p>
      ) : null}
    </div>
  );
}

export type AiInsightCardProps = {
  title: string;
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
  className?: string;
};

export function AiInsightCard({
  title,
  body,
  ctaLabel,
  onCta,
  className,
}: AiInsightCardProps) {
  return (
    <div
      className={cn(
        "ds-ai-glow ds-ai-pulse relative overflow-hidden rounded-[var(--ds-radius-card)] border border-[var(--ds-ai)]/25 bg-[var(--ds-ai-soft)] p-5",
        className
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1"
        style={{ background: "var(--ds-ai-gradient)" }}
        aria-hidden
      />
      <p className="ds-label text-[var(--ds-ai-strong)]">AI įžvalga</p>
      <h3 className="mt-1 text-[length:var(--ds-text-h3-size)] font-semibold text-[var(--ds-text-primary)]">
        {title}
      </h3>
      <p className="ds-body-sm mt-2">{body}</p>
      {ctaLabel && onCta ? (
        <Button
          variant="ai"
          size="sm"
          className="ds-focusable-ai mt-4"
          onClick={onCta}
        >
          {ctaLabel}
        </Button>
      ) : null}
    </div>
  );
}
