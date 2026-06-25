"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart, MapPin, Play } from "lucide-react";
import { formatDistanceBadge, formatPrice } from "@/data/mockListings";
import { useVauto } from "@/context/VautoContext";
import { listingPath } from "@/lib/seo";
import { TrustBadges } from "@/components/trust/TrustBadges";
import { SmartBrokerCard } from "@/components/broker/SmartBrokerCard";
import { VisualSearchStrip } from "@/components/search/VisualSearchStrip";
import { JobSearchPanel } from "@/components/jobs/JobSearchPanel";
import { JobListingResults } from "@/components/jobs/JobListingResults";
import { VehicleSearchPanel } from "@/components/vehicle/VehicleSearchPanel";
import { VehicleListingResults } from "@/components/vehicle/VehicleListingResults";
import { RealEstateSearchPanel } from "@/components/real-estate/RealEstateSearchPanel";
import { RealEstateListingResults } from "@/components/real-estate/RealEstateListingResults";
import { ClothingSearchPanel } from "@/components/clothing/ClothingSearchPanel";
import { ClothingListingResults } from "@/components/clothing/ClothingListingResults";
import { GeneralSearchPanel } from "@/components/general/GeneralSearchPanel";
import { GeneralListingResults } from "@/components/general/GeneralListingResults";
import { ServiceSearchPanel } from "@/components/services/ServiceSearchPanel";
import { ServiceListingResults } from "@/components/services/ServiceListingResults";
import { WantedEmptyState } from "@/components/wishlist/WantedEmptyState";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import { buildSmartBrokerSignal } from "@/lib/smart-broker";
import { portalExperienceForQuery } from "@/lib/portal-experience";
import type { ChameleonThemeId } from "@/lib/chameleon-themes";
import type { ScoredListing } from "@/lib/types";

const DEDICATED_PORTALS = new Set<ChameleonThemeId>([
  "autoplius",
  "cvbankas",
  "aruodas",
  "vinted",
  "skelbiu",
  "paslaugos",
]);

function SaveButton({
  listingId,
  isSaved,
  className,
}: {
  listingId: string;
  isSaved: boolean;
  className?: string;
}) {
  const { toggleSave } = useVauto();

  return (
    <button
      type="button"
      onClick={() => toggleSave(listingId)}
      className={className}
      aria-label={isSaved ? "Pašalinti iš mėgstamų" : "Išsaugoti"}
      aria-pressed={isSaved}
    >
      <Heart
        size={14}
        className={
          isSaved
            ? "fill-[#ef4444] text-[#ef4444]"
            : "text-[#374151]"
        }
      />
    </button>
  );
}

function ListingCard({ listing, priceColor }: { listing: ScoredListing; priceColor: string }) {
  const { savedIds } = useVauto();
  const isSaved = savedIds.has(listing.id);
  const href = listingPath(listing);

  return (
    <article className="portal-listing-card w-[156px] shrink-0 overflow-hidden rounded-2xl border border-[#dde5ef] bg-white p-2.5 shadow-sm transition-all hover:border-[var(--portal-accent,#1167b1)]/30 sm:w-[160px]">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-[#e5e7eb]">
        <Link href={href} className="block h-full w-full">
          <Image
            src={listing.image}
            alt={listing.title}
            fill
            sizes="160px"
            className="object-cover"
          />
          {listing.hasVideo && (
            <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white">
              <Play className="h-3.5 w-3.5 fill-white" />
            </span>
          )}
          <span className="absolute bottom-2 left-2 flex items-center gap-0.5 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
            <MapPin className="h-2.5 w-2.5" />
            {formatDistanceBadge(listing.distanceKm)}
          </span>
        </Link>
        <SaveButton
          listingId={listing.id}
          isSaved={isSaved}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm"
        />
      </div>

      <Link href={href} className="mt-2 block">
        <h3 className="truncate text-sm font-semibold text-[#111827]">
          {listing.title}
        </h3>
        <p className="text-base font-extrabold" style={{ color: priceColor }}>
          {formatPrice(listing.price, listing.priceLabel)}
        </p>
        <div className="mt-1">
          <TrustBadges listing={listing} />
        </div>
        <p className="mt-1 truncate text-[10px] text-[#6b7280]">
          {listing.location}
        </p>
      </Link>
    </article>
  );
}

function WideListingCard({ listing, priceColor }: { listing: ScoredListing; priceColor: string }) {
  const { savedIds } = useVauto();
  const isSaved = savedIds.has(listing.id);
  const href = listingPath(listing);

  return (
    <article className="portal-listing-card overflow-hidden rounded-2xl border border-[#dde5ef] bg-white p-2.5 shadow-sm transition-all hover:border-[var(--portal-accent,#1167b1)]/30">
      <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-[#e5e7eb]">
        <Link href={href} className="block h-full w-full">
          <Image
            src={listing.image}
            alt={listing.title}
            fill
            sizes="(max-width: 512px) 50vw"
            className="object-cover"
          />
          <span className="absolute bottom-2 left-2 flex items-center gap-0.5 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-medium text-white">
            <MapPin className="h-2.5 w-2.5" />
            {formatDistanceBadge(listing.distanceKm)}
          </span>
        </Link>
        <SaveButton
          listingId={listing.id}
          isSaved={isSaved}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm"
        />
      </div>
      <Link href={href} className="mt-2 block">
        <h3 className="line-clamp-1 text-sm font-semibold text-[#111827]">
          {listing.title}
        </h3>
        <p className="text-sm font-extrabold" style={{ color: priceColor }}>
          {formatPrice(listing.price, listing.priceLabel)}
        </p>
        <div className="mt-1">
          <TrustBadges listing={listing} />
        </div>
        <p className="mt-1 text-xs text-[#6b7280]">
          {listing.location}
        </p>
      </Link>
    </article>
  );
}

function emptyMessage(theme: ChameleonThemeId): string {
  switch (theme) {
    case "cvbankas":
      return "Darbo skelbimų nerasta. Pabandykite kitą raktinį žodį ar miestą.";
    case "autoplius":
      return "Automobilių nerasta. Pabandykite kitą markę ar miestą.";
    case "aruodas":
      return "NT skelbimų nerasta. Pabandykite kitą tipą ar miestą.";
    case "vinted":
      return "Drabužių nerasta. Pabandykite kitą dydį ar prekės ženklą.";
    case "skelbiu":
      return "Skelbimų nerasta. Pabandykite kitą kategoriją ar miestą.";
    case "paslaugos":
      return "Paslaugų teikėjų nerasta. Pabandykite kitą specialybę ar miestą.";
    default:
      return "Tiesioginių skelbimų dar nėra. Patikslinkite paiešką arba įtraukite prekę į pageidavimų sąrašą — pranešime, kai kas nors įkels atitinkantį skelbimą.";
  }
}

function PortalResults({
  theme,
  listings,
}: {
  theme: ChameleonThemeId;
  listings: ScoredListing[];
}) {
  switch (theme) {
    case "autoplius":
      return (
        <>
          <VehicleListingResults listings={listings} />
          {listings.length > 3 && (
            <div className="mt-6">
              <VehicleListingResults listings={listings.slice(3, 8)} title="Kiti pasiūlymai" />
            </div>
          )}
        </>
      );
    case "cvbankas":
      return (
        <>
          <JobListingResults listings={listings} />
          {listings.length > 3 && (
            <div className="mt-6">
              <JobListingResults
                listings={listings.slice(3, 8)}
                title="Jus taip pat gali sudominti:"
              />
            </div>
          )}
        </>
      );
    case "aruodas":
      return (
        <>
          <RealEstateListingResults listings={listings} />
          {listings.length > 3 && (
            <div className="mt-6">
              <RealEstateListingResults listings={listings.slice(3, 8)} title="Kiti objektai" />
            </div>
          )}
        </>
      );
    case "vinted":
      return (
        <>
          <ClothingListingResults listings={listings} />
          {listings.length > 4 && (
            <div className="mt-6">
              <ClothingListingResults listings={listings.slice(4, 10)} title="Dar galėtų patikti" />
            </div>
          )}
        </>
      );
    case "skelbiu":
      return (
        <>
          <GeneralListingResults listings={listings} />
          {listings.length > 3 && (
            <div className="mt-6">
              <GeneralListingResults listings={listings.slice(3, 8)} title="Kiti skelbimai" />
            </div>
          )}
        </>
      );
    case "paslaugos":
      return (
        <>
          <ServiceListingResults listings={listings} />
          {listings.length > 3 && (
            <div className="mt-6">
              <ServiceListingResults listings={listings.slice(3, 8)} title="Kiti meistrai" />
            </div>
          )}
        </>
      );
    default:
      return null;
  }
}

export function ListingGrid({ hideEmptyAssistant = false }: { hideEmptyAssistant?: boolean }) {
  const { rankedListings, searchQuery } = useVauto();
  const carouselListings = rankedListings.slice(0, 3);
  const gridListings = rankedListings.slice(3);
  const brokerSignal = buildSmartBrokerSignal(searchQuery, rankedListings);
  const portal = portalExperienceForQuery(searchQuery);
  const theme = portal.theme;
  const isDedicated = DEDICATED_PORTALS.has(theme);
  const ui = getPortalUi(theme);

  return (
    <section id="listing-results" aria-labelledby="listing-results-heading" className="py-2">
      <h2
        id="listing-results-heading"
        className={`mb-4 text-base font-bold tracking-tight ${ui.fontClass}`}
        style={{ color: ui.text }}
      >
        {searchQuery ? (
          <>{portal.portalName}: {rankedListings.length} rezultatų</>
        ) : (
          <>Populiariausi Lietuvoje</>
        )}
      </h2>

      {theme === "autoplius" && rankedListings.length > 0 && <VehicleSearchPanel />}
      {theme === "cvbankas" && rankedListings.length > 0 && <JobSearchPanel />}
      {theme === "aruodas" && rankedListings.length > 0 && <RealEstateSearchPanel />}
      {theme === "vinted" && rankedListings.length > 0 && <ClothingSearchPanel />}
      {theme === "skelbiu" && rankedListings.length > 0 && <GeneralSearchPanel />}
      {theme === "paslaugos" && rankedListings.length > 0 && <ServiceSearchPanel />}

      <VisualSearchStrip />

      {brokerSignal && !isDedicated && <SmartBrokerCard signal={brokerSignal} />}

      {rankedListings.length === 0 ? (
        searchQuery.trim().length >= 3 && !hideEmptyAssistant ? (
          <WantedEmptyState
            searchQuery={searchQuery}
            borderColor={ui.border}
            textMuted={ui.textMuted}
          />
        ) : searchQuery.trim().length < 3 ? (
          <p
            className="rounded-2xl border border-dashed bg-white p-6 text-center text-sm"
            style={{ borderColor: ui.border, color: ui.textMuted }}
          >
            {emptyMessage(theme)}
          </p>
        ) : null
      ) : isDedicated ? (
        <PortalResults theme={theme} listings={rankedListings} />
      ) : (
        <>
          <div className="scrollbar-hide -mx-4 flex gap-3 overflow-x-auto px-4 pb-4">
            {carouselListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} priceColor={ui.price} />
            ))}
          </div>

          {gridListings.length > 0 && (
            <div className="mt-2">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#6b7280]">
                Kiti pasiūlymai
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {gridListings.map((listing) => (
                  <WideListingCard key={listing.id} listing={listing} priceColor={ui.price} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

