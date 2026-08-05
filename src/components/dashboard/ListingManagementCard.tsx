"use client";

import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  Pencil,
  Share2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge, Button, Card, DropdownMenu } from "@/design-system";
import { formatPrice } from "@/data/mockListings";
import { getListingCoverImage } from "@/lib/listing-image";
import { getListingMetrics } from "@/lib/listing-analytics";
import {
  dashboardListingState,
  type DashboardListingState,
} from "@/lib/listing-visibility";
import { listingPath } from "@/lib/seo";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/cn";

export type ListingManagementCardProps = {
  listing: Listing;
  onEdit: () => void;
  onStats: () => void;
  onAiOptimize: () => void;
  onShare: () => void;
  onMarkSold: () => void;
  onHide: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
  className?: string;
};

function statusBadge(state: DashboardListingState): {
  label: string;
  tone: "success" | "warning" | "neutral" | "danger" | "info";
} {
  switch (state) {
    case "active":
      return { label: "Aktyvus", tone: "success" };
    case "sold":
      return { label: "Parduotas", tone: "neutral" };
    case "pending":
    case "paused":
      return { label: "Juodraštis", tone: "warning" };
    case "expired":
      return { label: "Pasibaigęs", tone: "danger" };
    case "deleted":
      return { label: "Paslėptas", tone: "info" };
  }
}

/** UI-only AI rekomendacija iš esamų skelbimo laukų / metrikų. */
export function resolveListingAiTip(listing: Listing): string {
  const imgs = listing.images?.filter(Boolean).length ?? 0;
  if (imgs < 3) {
    return "Pasiūlymas: Atnaujinkite nuotrauką — pridėkite bent 3 aiškias nuotraukas.";
  }
  const m = getListingMetrics(listing);
  if (m.views >= 15 && m.chatStarts + m.callClicks === 0) {
    return "Pasiūlymas: Sumažinkite kainą 5% arba atnaujinkite aprašymą — peržiūros yra, bet kontaktų mažai.";
  }
  if (
    typeof listing.appraisalScore === "number" &&
    listing.appraisalScore < 40
  ) {
    return "Pasiūlymas: Kaina atrodo aukšta rinkai — apsvarstykite 5% sumažinimą.";
  }
  const desc = listing.description?.trim() ?? "";
  if (desc.length < 40) {
    return "Pasiūlymas: Pridėkite išsamesnį aprašymą — pirkėjai labiau pasitiki.";
  }
  return "Pasiūlymas: Atnaujinkite skelbimą arba iškelkite, kad padidintumėte matomumą.";
}

/**
 * Listing Management Card 2.0 — DS Button hierarchija.
 * Tik UI; veiksmai perduodami iš tėvinio komponento.
 */
export function ListingManagementCard({
  listing,
  onEdit,
  onStats,
  onAiOptimize,
  onShare,
  onMarkSold,
  onHide,
  onDelete,
  onRestore,
  onPermanentDelete,
  className,
}: ListingManagementCardProps) {
  const state = dashboardListingState(listing);
  const badge = statusBadge(state);
  const isDeleted = state === "deleted";
  const isSold = state === "sold";
  const tip = resolveListingAiTip(listing);
  const publicHref = listing.id?.trim()
    ? `/listing/?id=${encodeURIComponent(listing.id.trim())}`
    : listingPath(listing);

  const overflowItems = isDeleted
    ? [
        { id: "restore", label: "Atkurti skelbimą" },
        { id: "purge", label: "Ištrinti visam laikui", danger: true },
      ]
    : [
        ...(isSold
          ? []
          : [{ id: "sold", label: "Pažymėti parduotu" }]),
        { id: "hide", label: "Slėpti" },
        { id: "delete", label: "Ištrinti", danger: true },
      ];

  return (
    <Card
      variant="default"
      data-listing-management-card
      className={cn("overflow-hidden p-0", className)}
    >
      <div className="flex flex-col gap-0 sm:flex-row">
        <Link
          href={publicHref}
          className="relative block aspect-[4/3] w-full shrink-0 overflow-hidden bg-[var(--ds-surface-muted)] sm:aspect-auto sm:h-auto sm:w-40 md:w-44"
        >
          <Image
            src={getListingCoverImage(listing)}
            alt={listing.title}
            fill
            sizes="(max-width: 640px) 100vw, 176px"
            className="object-cover"
          />
          <Badge
            tone={badge.tone}
            className="absolute left-2 top-2 shadow-sm"
          >
            {badge.label}
          </Badge>
        </Link>

        <div className="flex min-w-0 flex-1 flex-col p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="line-clamp-2 font-[family-name:var(--font-outfit)] text-sm font-semibold text-[var(--ds-text-primary)] sm:text-base">
                {listing.title}
              </h3>
              <p className="mt-1 text-lg font-extrabold tracking-tight text-[var(--ds-brand)]">
                {formatPrice(listing.price, listing.priceLabel)}
              </p>
            </div>
            {!isDeleted ? (
              <DropdownMenu
                label="⋯"
                className="shrink-0"
                items={overflowItems}
                onSelect={(id) => {
                  if (id === "sold") onMarkSold();
                  else if (id === "hide") onHide();
                  else if (id === "delete") onDelete();
                  else if (id === "restore") onRestore();
                  else if (id === "purge") onPermanentDelete();
                }}
              />
            ) : (
              <DropdownMenu
                label="⋯"
                className="shrink-0"
                items={overflowItems}
                onSelect={(id) => {
                  if (id === "restore") onRestore();
                  else if (id === "purge") onPermanentDelete();
                }}
              />
            )}
          </div>

          {!isDeleted && !isSold ? (
            <div className="mt-3 rounded-[var(--ds-radius-control)] border border-[var(--ds-ai)]/25 bg-[var(--ds-ai-soft)] px-3 py-2">
              <p className="flex items-start gap-1.5 text-xs leading-snug text-[var(--ds-ai-strong)]">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{tip}</span>
              </p>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {isDeleted ? (
              <>
                <Button variant="primary" size="sm" onClick={onRestore}>
                  Atkurti
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={onPermanentDelete}
                >
                  Ištrinti visam laikui
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={onEdit}
                >
                  Redaguoti
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<BarChart3 className="h-3.5 w-3.5" />}
                  onClick={onStats}
                >
                  Statistika
                </Button>
                <Button
                  variant="ai"
                  size="sm"
                  leftIcon={<Sparkles className="h-3.5 w-3.5" />}
                  onClick={onAiOptimize}
                  disabled={isSold}
                >
                  AI Optimizuoti
                </Button>
                <Button
                  variant="tertiary"
                  size="sm"
                  leftIcon={<Share2 className="h-3.5 w-3.5" />}
                  onClick={onShare}
                >
                  Dalintis
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
