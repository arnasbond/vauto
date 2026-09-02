"use client";

import Link from "next/link";
import { Heart, MapPin, Package } from "lucide-react";
import {
  formatListingPlaceLine,
  formatPrice,
  isAiDiscoverListing,
} from "@/data/mockListings";
import { LISTING_CATEGORY_LABELS } from "@vauto/shared/category-registry";
import { ListingImage } from "@/components/listing/ListingImage";
import { Badge, IconButton } from "@/design-system";
import { listingPath } from "@/lib/seo";
import { useVauto } from "@/context/VautoContext";
import type { Listing } from "@/lib/types";
import { FeedTierBadge, feedTierCardClass } from "@/components/marketplace/FeedTierBadge";
import { resolveFeedVisibilityTier, feedTierBadgeLabel } from "@/lib/feed-tier";
import { hasDeliveryCapability } from "@/lib/listing-capabilities";
import { cardAttributeLinesForListing } from "@/lib/vertical-presentation-contract";
import { cn } from "@/lib/cn";

export type ListingCardLayout = "grid" | "list";

export type ListingCardProps = {
  listing: Listing;
  layout?: ListingCardLayout;
  priceColor?: string;
  className?: string;
  showHeart?: boolean;
  /**
   * "compact" is an image-first density used for discovery surfaces (e.g.
   * the homepage trending strip) where the card's job is to be a quick
   * visual teaser rather than a full comparison card: image → title → price
   * only, with category/attributes/omniva/AI-signal/seller-reputation rows
   * omitted. Does not change "standard" rendering anywhere else.
   */
  variant?: "standard" | "compact";
};

/** AI kainos signalas iš appraisalScore / AI atranda žymos — tik UI. */
export function resolveAiPriceSignal(
  listing: Listing
): { label: string; tone: "success" | "ai" | "info" } | null {
  const score = listing.appraisalScore;
  if (typeof score === "number" && Number.isFinite(score)) {
    if (score >= 70) return { label: "Gera kaina", tone: "success" };
    if (score >= 40) return { label: "Rinkos mediana", tone: "info" };
    return { label: "AI įvertinta", tone: "ai" };
  }
  if (isAiDiscoverListing(listing) || listing.isAiTwinActive) {
    return { label: "AI įvertinta", tone: "ai" };
  }
  return null;
}

function isListingVerified(listing: Listing): boolean {
  return Boolean(
    listing.isVerified || listing.providerVerified || listing.vinVerified
  );
}

/**
 * ListingCard 2.0 — universal marketplace card (grid + list).
 * DS Badge / IconButton; hover lift + image zoom. No API changes.
 */
export function ListingCard({
  listing,
  layout = "grid",
  priceColor,
  className,
  showHeart = true,
  variant = "standard",
}: ListingCardProps) {
  const compact = variant === "compact";
  const { savedIds, toggleSave } = useVauto();
  const isSaved = savedIds.has(listing.id);
  const href = listingPath(listing);
  const resolvedPrice = priceColor || "var(--vauto-ink, #0f172a)";
  const aiPrice = resolveAiPriceSignal(listing);
  const verified = isListingVerified(listing);
  const omniva = hasDeliveryCapability(listing);
  const categoryLabel =
    LISTING_CATEGORY_LABELS[listing.category as keyof typeof LISTING_CATEGORY_LABELS] ??
    listing.category;
  const photoCount = listing.images?.length ?? 0;

  const heart = showHeart ? (
    <IconButton
      label={isSaved ? "Pašalinti iš mėgstamų" : "Išsaugoti"}
      tone="muted"
      size="sm"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleSave(listing.id);
      }}
      className={cn(
        "bg-[color-mix(in_srgb,var(--ds-surface-card)_92%,transparent)] shadow-[var(--ds-shadow-xs)] backdrop-blur-sm",
        "transition-transform duration-[160ms] hover:scale-110"
      )}
    >
      <Heart
        className={cn(
          "h-4 w-4 transition-colors duration-[160ms]",
          isSaved
            ? "fill-[#ef4444] text-[#ef4444]"
            : "text-[var(--ds-text-muted)]"
        )}
      />
    </IconButton>
  ) : null;

  const badges = (
    <div className="flex flex-wrap gap-1">
      <FeedTierBadge listing={listing} />
      {verified ? (
        <Badge tone="success" className="text-[10px]">
          Patvirtinta
        </Badge>
      ) : null}
      {aiPrice ? (
        <Badge
          tone={aiPrice.tone}
          className="text-[10px]"
          data-ai-price-signal={aiPrice.label}
          title="Analitinis kainos signalas — ne garantija ir ne pirkimo rekomendacija"
        >
          {aiPrice.label}
        </Badge>
      ) : null}
    </div>
  );

  // Compact (media-first, homepage discovery) density shows at most ONE
  // trust/quality signal chip — promoted tier > verified > AI signal — so
  // the small media area never competes with more than one badge.
  const feedTierLabel = feedTierBadgeLabel(resolveFeedVisibilityTier(listing));
  const compactBadge = feedTierLabel ? (
    <FeedTierBadge listing={listing} />
  ) : verified ? (
    <Badge tone="success" className="text-[10px]">
      Patvirtinta
    </Badge>
  ) : aiPrice ? (
    <Badge
      tone={aiPrice.tone}
      className="text-[10px]"
      data-ai-price-signal={aiPrice.label}
      title="Analitinis kainos signalas — ne garantija ir ne pirkimo rekomendacija"
    >
      {aiPrice.label}
    </Badge>
  ) : null;

  if (layout === "list") {
    return (
      <article
        data-listing-card="list"
        data-listing-id={listing.id}
        data-listing-category={listing.category}
        className={cn(
          "group flex gap-3 rounded-[var(--ds-radius-card)] border border-[var(--ds-card-border)] bg-[var(--ds-surface-card)] p-2.5",
          "shadow-[var(--ds-card-shadow)]",
          "transition-[transform,box-shadow,border-color] duration-[180ms] ease-[var(--ds-ease)]",
          "hover:-translate-y-[2px] hover:border-[var(--ds-border-strong)] hover:shadow-[var(--ds-card-shadow-hover)]",
          "active:translate-y-0 active:shadow-[var(--ds-shadow-xs)]",
          "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-brand)]",
          feedTierCardClass(listing),
          className
        )}
      >
        <Link
          href={href}
          className="relative aspect-[4/3] w-[42%] max-w-[158px] shrink-0 self-start overflow-hidden rounded-[var(--ds-radius-control)] bg-[var(--ds-surface-muted)]"
        >
          <ListingImage
            listing={listing}
            alt={listing.title}
            fill
            sizes="(max-width: 640px) 42vw, 158px"
            className="object-cover transition-transform duration-[200ms] group-hover:scale-105"
          />
          <div className="absolute left-1 top-1 z-[1]">{badges}</div>
          {photoCount > 1 ? (
            <span className="absolute bottom-1 right-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {photoCount}
            </span>
          ) : null}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[length:var(--ds-text-caption-size)] font-medium text-[var(--ds-text-muted)]">
            {categoryLabel}
          </p>
          <Link href={href}>
            <h3 className="mt-0.5 line-clamp-2 text-sm font-bold text-[var(--ds-text-primary)] transition-colors hover:text-[var(--ds-brand)]">
              {listing.title}
            </h3>
          </Link>
          <p
            className="mt-1 text-lg font-extrabold tracking-tight"
            style={{ color: resolvedPrice }}
          >
            {formatPrice(listing.price, listing.priceLabel)}
          </p>
          {cardAttributeLinesForListing(listing, 2).length > 0 ? (
            <ul
              className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] leading-tight text-[var(--ds-text-secondary)]"
              data-listing-card-attributes
            >
              {cardAttributeLinesForListing(listing, 2).map((attr) => (
                <li key={attr.key} className="inline-flex items-center gap-1">
                  <span className="text-[var(--ds-text-muted)]">{attr.label}</span>
                  <span className="font-semibold text-[var(--ds-text-primary)]">
                    {attr.value}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-1 flex items-center gap-1 text-xs text-[var(--ds-text-muted)]">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {formatListingPlaceLine(listing.location, listing.distanceKm)}
            </span>
          </p>
          {omniva ? (
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--ds-success)]">
              <Package className="h-3.5 w-3.5" aria-hidden />
              Omniva
            </p>
          ) : null}
        </div>
        {heart ? <div className="shrink-0 self-start">{heart}</div> : null}
      </article>
    );
  }

  return (
    <article
      data-listing-card="grid"
      data-listing-id={listing.id}
      data-listing-category={listing.category}
      className={cn(
        "group overflow-hidden rounded-[var(--ds-radius-card)] border border-[var(--ds-card-border)] bg-[var(--ds-surface-card)]",
        "shadow-[var(--ds-card-shadow)]",
        "transition-[transform,box-shadow,border-color] duration-[180ms] ease-[var(--ds-ease)]",
        "hover:-translate-y-[3px] hover:border-[var(--ds-border-strong)] hover:shadow-[var(--ds-card-shadow-hover)]",
        "active:translate-y-0 active:shadow-[var(--ds-shadow-xs)]",
        "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-brand)]",
        feedTierCardClass(listing),
        className
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden bg-[var(--ds-surface-muted)]",
          compact ? "aspect-[1/1]" : "aspect-[4/3]"
        )}
      >
        <Link href={href} className="block h-full w-full">
          <ListingImage
            listing={listing}
            alt={listing.title}
            fill
            sizes="(max-width: 512px) 50vw, 25vw"
            className="object-cover transition-transform duration-[200ms] ease-[var(--ds-ease)] group-hover:scale-105"
          />
        </Link>
        <div className="absolute left-2 top-2 z-[1] max-w-[70%]">
          {compact ? compactBadge : badges}
        </div>
        {heart ? (
          <div className="absolute right-2 top-2 z-[1]">{heart}</div>
        ) : null}
        {!compact ? (
          <span
            className="absolute bottom-2 left-2 z-[1] rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm"
            data-listing-card-category
          >
            {categoryLabel}
          </span>
        ) : null}
        {photoCount > 1 ? (
          <span className="absolute bottom-2 right-2 z-[1] rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            {compact ? photoCount : `${photoCount} foto`}
          </span>
        ) : null}
      </div>

      {compact ? (
        <Link href={href} className="block space-y-0.5 px-2.5 py-2">
          <h3 className="line-clamp-1 text-[13px] font-bold leading-snug text-[var(--ds-text-primary)]">
            {listing.title}
          </h3>
          <p
            className="text-base font-extrabold tracking-tight"
            style={{ color: resolvedPrice }}
          >
            {formatPrice(listing.price, listing.priceLabel)}
          </p>
        </Link>
      ) : (
        <Link href={href} className="block space-y-1.5 p-3.5">
          <p
            className="text-lg font-extrabold tracking-tight"
            style={{ color: resolvedPrice }}
            data-listing-card-price
          >
            {formatPrice(listing.price, listing.priceLabel)}
          </p>
          <h3 className="line-clamp-2 text-sm font-bold leading-snug text-[var(--ds-text-primary)]">
            {listing.title}
          </h3>
          {cardAttributeLinesForListing(listing, 2).length > 0 ? (
            <ul
              className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] leading-tight text-[var(--ds-text-secondary)]"
              data-listing-card-attributes
            >
              {cardAttributeLinesForListing(listing, 2).map((attr) => (
                <li key={attr.key} className="inline-flex items-center gap-1">
                  <span className="text-[var(--ds-text-muted)]">{attr.label}</span>
                  <span className="font-semibold text-[var(--ds-text-primary)]">
                    {attr.value}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <p className="flex min-w-0 items-center gap-1 text-xs text-[var(--ds-text-muted)]">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {formatListingPlaceLine(listing.location, listing.distanceKm)}
              </span>
            </p>
            {omniva ? (
              <span
                className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--ds-success)]"
                title="Omniva pristatymas"
              >
                <Package className="h-3.5 w-3.5" aria-hidden />
                Omniva
              </span>
            ) : null}
          </div>
        </Link>
      )}
    </article>
  );
}
