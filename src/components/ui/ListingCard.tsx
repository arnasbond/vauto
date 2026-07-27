import { AiBadge } from "@/components/ui/AiBadge";

export type ListingCardItem = {
  id: string;
  title: string;
  price: string;
  city: string;
  image: string;
  aiReady?: boolean;
};

type ListingCardProps = {
  item: ListingCardItem;
  href?: string;
  onClick?: () => void;
  className?: string;
};

/**
 * Redesign marketplace card — 4:3 media, ink price, optional AI badge.
 * Presentational only; wire API listings in Phase 2 via props.
 */
export function ListingCard({ item, href, onClick, className = "" }: ListingCardProps) {
  const media = (
    <div className="relative aspect-[4/3] overflow-hidden bg-[var(--vauto-surface-tint)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.image}
        alt=""
        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
      />
      {item.aiReady ? (
        <AiBadge className="absolute left-2.5 top-2.5" />
      ) : null}
    </div>
  );

  const body = (
    <div className="p-3.5">
      <p className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--vauto-ink)]">
        {item.title}
      </p>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <p className="text-base font-bold text-[var(--vauto-ink)]">{item.price}</p>
        <p className="text-xs text-[var(--vauto-subtle)]">{item.city}</p>
      </div>
    </div>
  );

  const shellClass = `group overflow-hidden rounded-2xl border border-[var(--vauto-border-subtle)] bg-white transition hover:border-[#C9D2E5] ${className}`;

  if (href) {
    return (
      <a href={href} className={`block ${shellClass}`} onClick={onClick}>
        {media}
        {body}
      </a>
    );
  }

  return (
    <article className={shellClass} onClick={onClick}>
      {media}
      {body}
    </article>
  );
}
