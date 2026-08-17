"use client";

import Link from "next/link";
import { Heart, MapPin, Package } from "lucide-react";
import {
  formatListingPlaceLine,
  formatPrice,
  isAiDiscoverListing,
  MOCK_CATEGORY_LABELS,
} from "@/data/mockListings";
import { ListingImage } from "@/components/listing/ListingImage";
import { VerifiedReputationBadge } from "@/components/reputation/VerifiedReputationBadge";
import { Badge, IconButton } from "@/design-system";
import { listingPath } from "@/lib/seo";
import { useVauto } from "@/context/VautoContext";
import type { Listing } from "@/lib/types";
import { FeedTierBadge, feedTierCardClass } from "@/components/marketplace/FeedTierBadge";
import { cn } from "@/lib/cn";

export type ListingCardLayout = "grid" | "list";

export type ListingCardProps = {
  listing: Listing;
  layout?: ListingCardLayout;
  priceColor?: string;
  className?: string;
  showHeart?: boolean;
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
}: ListingCardProps) {
  const { savedIds, toggleSave } = useVauto();
  const isSaved = savedIds.has(listing.id);
  const href = listingPath(listing);
  const resolvedPrice = priceColor || "var(--ds-brand, var(--vauto-ink))";
  const aiPrice = resolveAiPriceSignal(listing);
  const verified = isListingVerified(listing);
  const omniva = Boolean(listing.allowPastomatas);
  const categoryLabel =
    MOCK_CATEGORY_LABELS[listing.category] ?? listing.category;
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

  if (layout === "list") {
    return (
      <article
        data-listing-card="list"
        data-listing-id={listing.id}
        data-listing-category={listing.category}
        className={cn(
          "group flex gap-3 rounded-[var(--ds-radius-card)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] p-2.5",
          "transition-[transform,box-shadow,border-color] duration-[180ms] ease-[var(--ds-ease)]",
          "hover:-translate-y-[2px] hover:border-[var(--ds-border-strong)] hover:shadow-[var(--ds-shadow-md)]",
          feedTierCardClass(listing),
          className
        )}
      >
        <Link
          href={href}
          className="relative h-24 w-28 shrink-0 overflow-hidden rounded-[var(--ds-radius-control)] bg-[var(--ds-surface-muted)]"
        >
          <ListingImage
            listing={listing}
            alt={listing.title}
            fill
            sizes="112px"
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
          {listing.sellerId ? (
            <div className="mt-1">
              <VerifiedReputationBadge userId={listing.sellerId} compact />
            </div>
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
        "group overflow-hidden rounded-[var(--ds-radius-card)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)]",
        "transition-[transform,box-shadow,border-color] duration-[180ms] ease-[var(--ds-ease)]",
        "hover:-translate-y-[3px] hover:border-[var(--ds-border-strong)] hover:shadow-[var(--ds-shadow-md)]",
        feedTierCardClass(listing),
        className
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[var(--ds-surface-muted)]">
        <Link href={href} className="block h-full w-full">
          <ListingImage
            listing={listing}
            alt={listing.title}
            fill
            sizes="(max-width: 512px) 50vw, 25vw"
            className="object-cover transition-transform duration-[200ms] ease-[var(--ds-ease)] group-hover:scale-105"
          />
        </Link>
        <div className="absolute left-2 top-2 z-[1] max-w-[70%]">{badges}</div>
        {heart ? (
          <div className="absolute right-2 top-2 z-[1]">{heart}</div>
        ) : null}
        {photoCount > 1 ? (
          <span className="absolute bottom-2 right-2 z-[1] rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            {photoCount} foto
          </span>
        ) : null}
      </div>

      <Link href={href} className="block space-y-1.5 p-3.5">
        <p className="text-[length:var(--ds-text-caption-size)] font-medium text-[var(--ds-text-muted)]">
          {categoryLabel}
        </p>
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-snug text-[var(--ds-text-primary)]">
          {listing.title}
        </h3>
        <p
          className="text-lg font-extrabold tracking-tight"
          style={{ color: resolvedPrice }}
        >
          {formatPrice(listing.price, listing.priceLabel)}
        </p>
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
        {aiPrice ? (
          <p
            className="inline-flex items-center gap-1 rounded-full bg-[var(--ds-ai-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ds-ai-strong)]"
            data-ai-price-insight
          >
            {aiPrice.label}
          </p>
        ) : null}
        {listing.sellerId ? (
          <div className="px-0 pt-1">
            <VerifiedReputationBadge userId={listing.sellerId} compact />
          </div>
        ) : null}
      </Link>
    </article>
  );
}
