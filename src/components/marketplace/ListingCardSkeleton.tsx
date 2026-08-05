import { Skeleton } from "@/design-system";
import { cn } from "@/lib/cn";

export type ListingCardSkeletonProps = {
  layout?: "grid" | "list";
  className?: string;
};

/** Pulsing ListingCard 2.0 placeholder — replaces spinner loading states. */
export function ListingCardSkeleton({
  layout = "grid",
  className,
}: ListingCardSkeletonProps) {
  if (layout === "list") {
    return (
      <div
        data-listing-card-skeleton="list"
        className={cn(
          "flex gap-3 rounded-[var(--ds-radius-card)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] p-2.5",
          className
        )}
        aria-hidden
      >
        <Skeleton rounded="control" className="h-24 w-28 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 py-0.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-[80%]" />
          <Skeleton className="h-4 w-[50%]" />
          <Skeleton className="mt-auto h-5 w-24" />
        </div>
      </div>
    );
  }

  return (
    <div
      data-listing-card-skeleton="grid"
      className={cn(
        "overflow-hidden rounded-[var(--ds-radius-card)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)]",
        className
      )}
      aria-hidden
    >
      <Skeleton rounded="card" className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-2 p-3.5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[75%]" />
        <Skeleton className="mt-1 h-6 w-28" />
        <Skeleton className="h-3 w-[50%]" />
      </div>
    </div>
  );
}

export type ListingGridSkeletonProps = {
  count?: number;
  layout?: "grid" | "list";
  className?: string;
};

export function ListingGridSkeleton({
  count = 8,
  layout = "grid",
  className,
}: ListingGridSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  if (layout === "list") {
    return (
      <div
        className={cn("mt-3 space-y-2", className)}
        role="status"
        aria-live="polite"
        aria-label="Kraunami skelbimai"
      >
        {items.map((i) => (
          <ListingCardSkeleton key={i} layout="list" />
        ))}
        <span className="sr-only">Ieškoma…</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mt-3 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4",
        className
      )}
      role="status"
      aria-live="polite"
      aria-label="Kraunami skelbimai"
    >
      {items.map((i) => (
        <ListingCardSkeleton key={i} layout="grid" />
      ))}
      <span className="sr-only">Ieškoma…</span>
    </div>
  );
}
