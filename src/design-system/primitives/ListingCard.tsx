import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../utils";

export type ListingCardProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  children: ReactNode;
  /** Tap target for the card (typically next/link). */
  renderMedia?: ReactNode;
  badge?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  price?: ReactNode;
  footer?: ReactNode;
  elevated?: boolean;
};

/**
 * VAUTO ListingCard shell (Stage 17D). A token-clean, organic shell for
 * marketplace listings: media, badge, title, metadata, price, actions.
 * Radius/hover/focus inherit the DS surface tokens; mobile tap targets are
 * generous by default. Product workflow data flows through slots, not here.
 */
export function ListingCard({
  children,
  renderMedia,
  badge,
  title,
  subtitle,
  meta,
  price,
  footer,
  elevated = false,
  className,
  ...rest
}: ListingCardProps) {
  return (
    <article
      className={cn(
        "ds-card-lift flex flex-col overflow-hidden rounded-[var(--ds-radius-card)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] text-[var(--ds-text-primary)]",
        elevated && "shadow-[var(--ds-shadow-sm)]",
        className
      )}
      {...rest}
    >
      {renderMedia ? (
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--ds-surface-muted)]">
          {renderMedia}
          {badge ? <div className="absolute left-2 top-2 z-10">{badge}</div> : null}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {title ? (
          <h3 className="ds-label line-clamp-2 text-[var(--ds-text-primary)]">{title}</h3>
        ) : null}
        {subtitle ? (
          <p className="line-clamp-2 text-[length:var(--ds-text-caption-size)] leading-snug text-[var(--ds-text-secondary)]">
            {subtitle}
          </p>
        ) : null}
        {meta ? <div className="ds-caption text-[var(--ds-text-muted)]">{meta}</div> : null}

        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          {price ? (
            <div className="ds-label text-[var(--ds-text-primary)]">{price}</div>
          ) : null}
        </div>

        {footer ? <div className="mt-2 border-t border-[var(--ds-border-subtle)] pt-2">{footer}</div> : null}
      </div>

      {children}
    </article>
  );
}
