"use client";

import Image from "next/image";
import Link from "next/link";
import {
  CheckCircle,
  Eye,
  Pencil,
  Phone,
  Power,
  PowerOff,
  Sparkles,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { formatPrice } from "@/data/mockListings";
import { FeedTierBadge, feedTierCardClass } from "@/components/marketplace/FeedTierBadge";
import { getListingCoverImage } from "@/lib/listing-image";
import { getListingMetrics } from "@/lib/listing-analytics";
import { formatExpiryLabel } from "@/lib/listing-expiry";
import {
  dashboardListingState,
  dashboardStateClass,
  dashboardStateLabel,
} from "@/lib/listing-visibility";
import { listingPath } from "@/lib/seo";
import { resolveFeedVisibilityTier } from "@/lib/feed-tier";
import type { Listing, UserProfile } from "@/lib/types";
import { JobApplicationsInbox } from "@/components/dashboard/JobApplicationsInbox";
import { ShareListingButton } from "@/components/social/ShareListingButton";
import { cn } from "@/lib/cn";

interface DashboardListingCardProps {
  listing: Listing;
  user: UserProfile;
  showCvInbox?: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onBoost: () => void;
  onAiAdvisor: () => void;
  onMarkSold?: () => void;
  onDelete: () => void;
}

export function DashboardListingCard({
  listing,
  user,
  showCvInbox = false,
  onEdit,
  onToggleActive,
  onBoost,
  onAiAdvisor,
  onMarkSold,
  onDelete,
}: DashboardListingCardProps) {
  const state = dashboardListingState(listing);
  const metrics = getListingMetrics(listing);
  const expiryLabel = formatExpiryLabel(listing);
  const tier = resolveFeedVisibilityTier(listing);
  const isVip = tier === "top" || tier === "plus";
  const isPaused = listing.status === "paused";

  return (
    <article
      className={cn(
        "vauto-dashboard-card rounded-2xl border p-3 transition",
        isVip ? feedTierCardClass(listing) : "border-[var(--vauto-border)]"
      )}
    >
      <div className="flex gap-3">
        <Link
          href={listingPath(listing)}
          className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl"
        >
          <Image
            src={getListingCoverImage(listing)}
            alt={listing.title}
            fill
            sizes="64px"
            className="object-cover"
          />
          {isVip && (
            <span className="absolute left-0 top-0 m-1">
              <FeedTierBadge listing={listing} />
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="truncate font-semibold text-sm text-[var(--vauto-text)]">
              {listing.title}
            </p>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                dashboardStateClass(state)
              )}
            >
              {dashboardStateLabel(state)}
            </span>
          </div>
          <p className="text-sm font-bold text-[var(--vauto-orange)]">
            {formatPrice(listing.price, listing.priceLabel)}
          </p>
          <p className="text-xs text-[var(--vauto-text-muted)]">{listing.location}</p>
          {expiryLabel && state !== "sold" && (
            <p className="mt-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
              {expiryLabel}
            </p>
          )}
        </div>
      </div>

      {state !== "sold" && (
        <div className="mt-2 flex gap-3 text-[10px] text-[var(--vauto-text-muted)]">
          <span className="inline-flex items-center gap-0.5">
            <Eye className="h-3 w-3" /> {metrics.views}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Phone className="h-3 w-3" /> {metrics.callClicks}
          </span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="flex flex-1 min-w-[7rem] items-center justify-center gap-1 rounded-xl bg-[var(--vauto-surface-muted)] py-2 text-xs font-medium text-[var(--vauto-text)]"
        >
          <Pencil className="h-3 w-3" />
          Redaguoti
        </button>
        {state !== "sold" && (
          <button
            type="button"
            onClick={onToggleActive}
            className="flex flex-1 min-w-[7rem] items-center justify-center gap-1 rounded-xl border border-[var(--vauto-border)] py-2 text-xs font-medium text-[var(--vauto-text)]"
          >
            {isPaused ? (
              <>
                <Power className="h-3 w-3" />
                Aktyvuoti
              </>
            ) : (
              <>
                <PowerOff className="h-3 w-3" />
                Deaktyvuoti
              </>
            )}
          </button>
        )}
        {state !== "sold" && (
          <button
            type="button"
            onClick={onBoost}
            className="flex items-center justify-center gap-1 rounded-xl bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
          >
            <TrendingUp className="h-3 w-3" />
            Iškelti
          </button>
        )}
        <button
          type="button"
          onClick={onAiAdvisor}
          className="flex items-center justify-center gap-1 rounded-xl bg-[var(--vauto-teal)]/10 px-3 py-2 text-xs font-medium text-[var(--vauto-teal)]"
        >
          <Sparkles className="h-3 w-3" />
          AI ekspertas
        </button>
        {state !== "sold" && <ShareListingButton listing={listing} className="flex-1" />}
        {onMarkSold && state !== "sold" && (
          <button
            type="button"
            onClick={onMarkSold}
            className="flex items-center justify-center gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
          >
            <CheckCircle className="h-3 w-3" />
            Parduota
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center justify-center rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300"
          aria-label="Ištrinti"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {showCvInbox && listing.category === "jobs" && (
        <JobApplicationsInbox listing={listing} employerId={user.id} />
      )}
    </article>
  );
}
