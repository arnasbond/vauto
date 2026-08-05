import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export type PageContainerProps = {
  children: ReactNode;
  /** compact ≈ mobile form, wide ≈ marketplace / desktop portal */
  width?: "compact" | "default" | "wide";
  className?: string;
  as?: "div" | "main" | "section";
};

const WIDTH: Record<NonNullable<PageContainerProps["width"]>, string> = {
  compact: "max-w-lg",
  default: "max-w-5xl",
  wide: "max-w-[var(--anonser-desktop-max,80rem)]",
};

export function PageContainer({
  children,
  width = "wide",
  className,
  as: Tag = "div",
}: PageContainerProps) {
  return (
    <Tag
      data-page-container={width}
      className={cn(
        "mx-auto w-full flex-1 px-4 py-4 md:px-6 md:py-6",
        WIDTH[width],
        className
      )}
    >
      {children}
    </Tag>
  );
}

export type BreadcrumbItem = { label: string; href?: string };

export type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  className?: string;
};

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (!items.length) return null;
  return (
    <nav aria-label="Kelias" className={cn("mb-4", className)}>
      <ol className="flex flex-wrap items-center gap-1.5 text-[length:var(--ds-text-caption-size)] text-[var(--ds-text-muted)]">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="inline-flex items-center gap-1.5">
              {i > 0 ? <span aria-hidden>/</span> : null}
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="font-medium text-[var(--ds-text-secondary)] transition-colors hover:text-[var(--ds-brand)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={cn(last && "font-semibold text-[var(--ds-text-primary)]")}
                  aria-current={last ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
