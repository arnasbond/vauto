"use client";

import Link from "next/link";
import {
  Calendar,
  Handshake,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import { AiInsightCard, Badge, Button, Card } from "@/design-system";
import { TrustBadges } from "@/components/trust/TrustBadges";
import { SellerRatingBadge } from "@/components/listing/SellerRatingBadge";
import { VerifiedReputationBadge } from "@/components/reputation/VerifiedReputationBadge";
import { ShareListingPanel } from "@/components/social/ShareListingPanel";
import { resolveAiPriceSignal } from "@/components/marketplace/ListingCard";
import { formatListingPlaceLine, formatPrice } from "@/data/mockListings";
import { sellerDisplayName } from "@/lib/seller-display";
import { sellerPath } from "@/lib/seo";
import type { Listing, SellerReview, UserProfile } from "@/lib/types";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

function formatPostedDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("lt-LT", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export type ListingDetailStickyPanelProps = {
  listing: Listing;
  categoryLabel: string | null;
  isOwner: boolean;
  phoneDisplay: string;
  phoneTel: string | null;
  demoPhone: boolean;
  offersOmnivaShipping: boolean;
  wardrobeContext: boolean;
  reviews: SellerReview[];
  currentUser?: UserProfile | null;
  vatLine?: ReactNode;
  onMessage: () => void;
  onCall: () => void;
  onTrackCall: () => void;
  onOpenShipping: () => void;
  onOpenTips: () => void;
  onNegotiate: () => void;
  onStartDeal?: () => void;
  className?: string;
};

/**
 * Sticky pirkėjo panelis (desktop) — DS Card + esami CTA handleriai.
 */
export function ListingDetailStickyPanel({
  listing,
  categoryLabel,
  isOwner,
  phoneDisplay,
  phoneTel,
  demoPhone,
  offersOmnivaShipping,
  wardrobeContext,
  reviews,
  currentUser = null,
  vatLine,
  onMessage,
  onCall,
  onTrackCall,
  onOpenShipping,
  onOpenTips,
  onNegotiate,
  onStartDeal,
  className,
}: ListingDetailStickyPanelProps) {
  const aiPrice = resolveAiPriceSignal(listing);
  const sellerName = sellerDisplayName(listing.sellerId, {
    listing,
    user: currentUser ?? undefined,
  });
  const sellerInitial = (sellerName.trim().charAt(0) || "P").toUpperCase();
  const sellerReviewCount = reviews.filter(
    (r) => r.sellerId === listing.sellerId
  ).length;
  const responseHint =
    sellerReviewCount >= 5
      ? "Paprastai atsako greitai"
      : sellerReviewCount > 0
        ? "Atsako per žinutes"
        : "Naujas pardavėjas";

  return (
    <Card
      variant="elevated"
      data-listing-sticky-panel
      className={cn(
        "hidden lg:sticky lg:top-20 lg:block lg:shadow-[var(--ds-shadow-md)]",
        className
      )}
    >
      {categoryLabel ? (
        <Badge tone="category" className="mb-2">
          {categoryLabel}
        </Badge>
      ) : null}

      <h1 className="font-[family-name:var(--font-outfit)] text-[length:var(--ds-text-h2-size)] font-bold leading-tight tracking-tight text-[var(--ds-text-primary)]">
        {listing.title}
      </h1>
      <p className="mt-2 text-[clamp(1.75rem,2.5vw,2.25rem)] font-extrabold tracking-tight text-[var(--ds-brand)]">
        {formatPrice(listing.price, listing.priceLabel)}
      </p>
      {vatLine}

      {aiPrice ? (
        <div className="mt-4">
          <AiInsightCard
            title={aiPrice.label}
            body={
              aiPrice.label === "Gera kaina"
                ? "Pagal panašius skelbimus ši kaina atrodo patraukli pirkėjui."
                : aiPrice.label === "Rinkos mediana"
                  ? "Kaina artima rinkos viduriui — derėtis galima, bet vertė aiški."
                  : "AI įvertino šį skelbimą pagal nuotrauką ir aprašymą."
            }
            ctaLabel={isOwner ? undefined : "AI klausimai pardavėjui"}
            onCta={isOwner ? undefined : onOpenTips}
          />
        </div>
      ) : !isOwner ? (
        <div className="mt-4">
          <AiInsightCard
            title="Paklauskite AI"
            body="Gaukite saugius klausimus pardavėjui — kainą, būklę, pristatymą."
            ctaLabel="Atidaryti AI patarimus"
            onCta={onOpenTips}
          />
        </div>
      ) : null}

      <div className="mt-5 space-y-3 rounded-[var(--ds-radius-control)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-muted)] p-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--ds-brand-soft)] text-sm font-bold text-[var(--ds-brand)]"
            aria-hidden
          >
            {sellerInitial}
          </span>
          <div className="min-w-0">
            <Link
              href={sellerPath(listing.sellerId)}
              className="block truncate text-sm font-semibold text-[var(--ds-brand)] hover:underline"
            >
              {sellerName}
            </Link>
            <p className="text-xs text-[var(--ds-text-muted)]">{responseHint}</p>
          </div>
        </div>
        <TrustBadges listing={listing} size="md" />
        <SellerRatingBadge
          sellerId={listing.sellerId}
          reviews={reviews}
          authProvider={currentUser?.authProvider}
          profile={currentUser}
        />
        <VerifiedReputationBadge userId={listing.sellerId} />
        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--ds-text-muted)]">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden />
            {formatListingPlaceLine(listing.location, listing.distanceKm)}
          </span>
          {listing.createdAt ? (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" aria-hidden />
              {formatPostedDate(listing.createdAt)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2">
        {isOwner ? (
          <>
            <Button
              variant="primary"
              disabled
              leftIcon={<MessageCircle className="h-4 w-4" />}
              title="Taip matys pirkėjai — žinutės sau nesiunčiamos"
              className="w-full"
            >
              Rašyti žinutę
            </Button>
            <Button
              variant="secondary"
              disabled
              leftIcon={<Phone className="h-4 w-4" />}
              title="Taip matys pirkėjai — jūsų skelbime skambutis neaktyvus"
              className="w-full"
            >
              Skambinti ({phoneDisplay})
            </Button>
            <p className="text-center text-[11px] font-medium text-[var(--ds-text-muted)]">
              Peržiūra — taip pirkėjai matys kontaktų mygtukus
            </p>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              leftIcon={<MessageCircle className="h-4 w-4" />}
              onClick={onMessage}
              className="w-full"
              data-listing-message-cta="1"
            >
              Rašyti žinutę
            </Button>
            <Button
              variant="secondary"
              leftIcon={<Phone className="h-4 w-4" />}
              onClick={() => {
                onTrackCall();
                if (!demoPhone && phoneTel) {
                  window.location.href = phoneTel;
                  return;
                }
                onCall();
              }}
              className="w-full"
            >
              Skambinti ({phoneDisplay})
            </Button>
            {onStartDeal ? (
              <Button
                variant="primary"
                leftIcon={<Handshake className="h-4 w-4" />}
                onClick={onStartDeal}
                className="w-full"
                data-start-deal-cta="1"
              >
                Pradėti sandorio eigą
              </Button>
            ) : null}
            {offersOmnivaShipping ? (
              <Button
                variant="ai"
                leftIcon={<Truck className="h-4 w-4" />}
                onClick={onOpenShipping}
                className="w-full"
                data-order-shipping-cta="1"
              >
                Pirkti per Escrow · Omniva
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Sparkles className="h-3.5 w-3.5" />}
              onClick={onOpenTips}
              data-listing-ai-tips="1"
              className="w-full"
            >
              AI klausimai pardavėjui
            </Button>
            {wardrobeContext ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onNegotiate}
                className="w-full text-[var(--ds-text-muted)]"
              >
                AI Derybininkas
              </Button>
            ) : null}
          </>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {offersOmnivaShipping ? (
          <Badge tone="success" className="gap-1">
            <Package className="mr-1 inline h-3 w-3" aria-hidden />
            Omniva pristatymas
          </Badge>
        ) : null}
        <Badge tone="info" className="gap-1">
          <ShieldCheck className="mr-1 inline h-3 w-3" aria-hidden />
          Sandorio eiga per platformą
        </Badge>
      </div>
      {offersOmnivaShipping ? (
        <p
          className="mt-2 text-xs leading-relaxed text-[var(--ds-text-muted)]"
          data-omniva-hint
        >
          Siuntos būseną atnaujina Omniva. Sandorio „Išsiųsta“ atsiranda po
          vežėjo skenavimo, ne iš naršyklės. Lėšos laikomos, kol patvirtinate
          gavimą.
        </p>
      ) : null}

      {!isOwner ? (
        <div className="mt-5 border-t border-[var(--ds-border-subtle)] pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
            Dalintis
          </p>
          <ShareListingPanel listing={listing} compact />
        </div>
      ) : null}
    </Card>
  );
}
