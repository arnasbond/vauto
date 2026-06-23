"use client";

import { useCallback, useState } from "react";
import { CallAndSellWidget } from "@/components/dashboard/CallAndSellWidget";
import { BuyerIntentBanner } from "@/components/dashboard/BuyerIntentBanner";
import { B2BBillingCard } from "@/components/dashboard/B2BBillingCard";
import { BulkUploadCard } from "@/components/dashboard/BulkUploadCard";
import { BusinessIdentityCard } from "@/components/dashboard/BusinessIdentityCard";
import { BusinessMarketInsights } from "@/components/dashboard/BusinessMarketInsights";
import { SoldPromptBanner } from "@/components/dashboard/SoldPromptBanner";
import { ProListingCard } from "@/components/dashboard/ProListingCard";
import { ServiceCalendar } from "@/components/dashboard/ServiceCalendar";
import { ServiceLeadInbox } from "@/components/dashboard/ServiceLeadInbox";
import { MicroAnalytics } from "@/components/dashboard/MicroAnalytics";
import { VisibilityPricingCard } from "@/components/dashboard/VisibilityPricingCard";
import { VautoWallet } from "@/components/dashboard/VautoWallet";
import { mockServiceBookings } from "@/lib/dashboard-mock";
import { useVauto } from "@/context/VautoContext";
import { computeSellerRating } from "@/lib/reviews";
import type { Listing, UserProfile } from "@/lib/types";
import type { VisibilityTierId } from "@/lib/visibility-plans";

type DashboardTab = "overview" | "listings" | "pricing";

interface ProBusinessDashboardProps {
  user: UserProfile;
  listings: Listing[];
  allListings: Listing[];
  onEdit: (listing: Listing) => void;
  onDelete: (id: string) => void;
  onMarkSold: (id: string) => void;
  onTopUp: (amount: number) => void;
  onPromote: (listingId: string, cost: number, tierId: VisibilityTierId) => boolean;
  onRenew: (id: string) => void;
}

const TABS: { id: DashboardTab; label: string }[] = [
  { id: "overview", label: "Apžvalga" },
  { id: "listings", label: "Skelbimai" },
  { id: "pricing", label: "Kainodara" },
];

export function ProBusinessDashboard({
  user,
  listings,
  allListings,
  onEdit,
  onDelete,
  onMarkSold,
  onTopUp,
  onPromote,
  onRenew,
}: ProBusinessDashboardProps) {
  const { buyerIntentCount, soldPromptDismissed, dismissSoldPrompt, reviews, sellerAnalytics } =
    useVauto();
  const rating = computeSellerRating(reviews, user.id);
  const serviceRating = rating.count > 0 ? rating.avg : 4.9;
  const showCalendar =
    user.businessType === "services" ||
    listings.some((l) => l.category === "services");

  const [tab, setTab] = useState<DashboardTab>("overview");
  const [promoteTargetId, setPromoteTargetId] = useState<string | null>(null);

  const handlePromoteFromInsights = useCallback((listingId: string) => {
    setTab("listings");
    setPromoteTargetId(listingId);
    requestAnimationFrame(() => {
      document
        .getElementById(`listing-card-${listingId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  return (
    <div>
      <BusinessIdentityCard user={user} />

      <div className="mb-4 flex gap-2 overflow-x-auto">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold ${
              tab === item.id
                ? "bg-[var(--vauto-teal)] text-white"
                : "bg-white/10 text-slate-300"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <BusinessMarketInsights
            listings={listings}
            allListings={allListings}
            buyerIntentCount={buyerIntentCount}
            onPromoteListing={handlePromoteFromInsights}
          />
          <MicroAnalytics
            views={sellerAnalytics.views}
            callClicks={sellerAnalytics.callClicks}
            saves={sellerAnalytics.saves}
            chatStarts={sellerAnalytics.chatStarts}
            interestScore={sellerAnalytics.interestScore}
          />
          <CallAndSellWidget
            views={sellerAnalytics.views}
            callClicks={sellerAnalytics.callClicks}
            saves={sellerAnalytics.saves}
            chatStarts={sellerAnalytics.chatStarts}
          />
          <BuyerIntentBanner intentCount={buyerIntentCount} />
          <SoldPromptBanner
            listings={listings}
            dismissedIds={soldPromptDismissed}
            onMarkSold={onMarkSold}
            onRenew={onRenew}
            onDismiss={dismissSoldPrompt}
          />
          <VautoWallet balance={user.walletBalance ?? 0} onTopUp={onTopUp} />
          {showCalendar && (
            <>
              <ServiceLeadInbox
                balance={user.walletBalance ?? 0}
                user={user}
                rating={serviceRating}
              />
              <ServiceCalendar bookings={mockServiceBookings()} />
            </>
          )}
        </>
      )}

      {tab === "pricing" && (
        <>
          <B2BBillingCard
            balance={user.walletBalance ?? 0}
            clicks={sellerAnalytics.views}
            callClicks={sellerAnalytics.callClicks}
            activeListings={listings.length}
          />
          <VisibilityPricingCard
            listings={listings}
            allListings={allListings}
            user={user}
          />
          <BulkUploadCard />
        </>
      )}

      {tab === "listings" && (
        <section className="mt-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Mano skelbimai
          </h2>
          <div className="space-y-3">
            {listings.length === 0 ? (
              <p className="vauto-dashboard-card rounded-2xl py-8 text-center text-sm text-slate-500">
                Pridėkite skelbimus ir stebėkite analitiką realiu laiku.
              </p>
            ) : (
              listings.map((l) => (
                <div key={l.id} id={`listing-card-${l.id}`}>
                  <ProListingCard
                    listing={l}
                    allListings={allListings}
                    user={user}
                    buyerIntentCount={buyerIntentCount}
                    walletBalance={user.walletBalance ?? 0}
                    autoOpenPromote={promoteTargetId === l.id}
                    onPromoteOpened={() => setPromoteTargetId(null)}
                    onEdit={() => onEdit(l)}
                    onDelete={() => onDelete(l.id)}
                    onPromote={onPromote}
                    onRenew={() => onRenew(l.id)}
                  />
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}
