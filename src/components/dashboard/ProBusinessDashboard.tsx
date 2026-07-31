"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LineChart } from "lucide-react";
import { CallAndSellWidget } from "@/components/dashboard/CallAndSellWidget";
import { BuyerIntentBanner } from "@/components/dashboard/BuyerIntentBanner";
import { B2BAnalyticsPanel } from "@/components/dashboard/B2BAnalyticsPanel";
import { B2BBillingCard } from "@/components/dashboard/B2BBillingCard";
import { B2BPlanCreditsCard } from "@/components/dashboard/B2BPlanCreditsCard";
import { LaunchTrialBanner } from "@/components/dashboard/LaunchTrialBanner";
import { BulkUploadCard } from "@/components/dashboard/BulkUploadCard";
import { BusinessIdentityCard } from "@/components/dashboard/BusinessIdentityCard";
import { BusinessMarketInsights } from "@/components/dashboard/BusinessMarketInsights";
import { SellerDraftsStrip } from "@/components/dashboard/SellerDraftsStrip";
import { SoldPromptBanner } from "@/components/dashboard/SoldPromptBanner";
import { ProListingCard } from "@/components/dashboard/ProListingCard";
import { ServiceCalendar } from "@/components/dashboard/ServiceCalendar";
import { ServiceLeadInbox } from "@/components/dashboard/ServiceLeadInbox";
import { MicroAnalytics } from "@/components/dashboard/MicroAnalytics";
import { VisibilityPricingCard } from "@/components/dashboard/VisibilityPricingCard";
import { VautoWallet } from "@/components/dashboard/VautoWallet";
import {
  Disclosure,
  SegmentedTabs,
  StatGrid,
  type SegmentedTabItem,
} from "@/components/ui/surface";
import { mockServiceBookings } from "@/lib/dashboard-mock";
import { useVauto } from "@/context/VautoContext";
import { useSellerListingAnalytics } from "@/hooks/useSellerListingAnalytics";
import { apiFetchHealthDetails } from "@/lib/api/client";
import { computeSellerRating } from "@/lib/reviews";
import type { Listing, UserProfile } from "@/lib/types";

type DashboardTab = "overview" | "listings" | "pricing" | "services";

interface ProBusinessDashboardProps {
  user: UserProfile;
  listings: Listing[];
  allListings: Listing[];
  activeJobListings?: number;
  onEdit: (listing: Listing) => void;
  onDelete: (id: string) => void;
  onMarkSold: (id: string) => void;
  onTopUp: (amount: number) => void;
  onRenew: (id: string) => void;
}

export function ProBusinessDashboard({
  user,
  listings,
  allListings,
  activeJobListings = 0,
  onEdit,
  onDelete,
  onMarkSold,
  onTopUp,
  onRenew,
}: ProBusinessDashboardProps) {
  const {
    buyerIntentCount,
    soldPromptDismissed,
    dismissSoldPrompt,
    reviews,
    sellerAnalytics,
    openCheckout,
    apiActive,
  } = useVauto();
  const [stripeEnabled, setStripeEnabled] = useState(false);

  useEffect(() => {
    if (!apiActive) {
      setStripeEnabled(false);
      return;
    }
    void apiFetchHealthDetails().then((r) => {
      if (r.ok) setStripeEnabled(Boolean(r.data.features?.stripe));
    });
  }, [apiActive]);

  const rating = computeSellerRating(reviews, user.id);
  const serviceRating = rating.count > 0 ? rating.avg : 4.9;
  const showServices =
    user.businessType === "services" ||
    listings.some((l) => l.category === "services");
  const activeListingCount = listings.filter((l) => l.status !== "sold").length;
  const liveAnalytics = useSellerListingAnalytics(apiActive, sellerAnalytics);

  const [tab, setTab] = useState<DashboardTab>("overview");
  const [promoteTargetId, setPromoteTargetId] = useState<string | null>(null);

  const tabs = useMemo<SegmentedTabItem<DashboardTab>[]>(() => {
    const base: SegmentedTabItem<DashboardTab>[] = [
      { id: "overview", label: "Apžvalga" },
      { id: "listings", label: "Skelbimai", badge: activeListingCount },
      { id: "pricing", label: "Kainodara" },
    ];
    if (showServices) base.push({ id: "services", label: "Paslaugos" });
    return base;
  }, [activeListingCount, showServices]);

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
      <SellerDraftsStrip />
      <LaunchTrialBanner user={user} />

      <StatGrid
        className="mb-4"
        stats={[
          { label: "Aktyvūs skelbimai", value: String(activeListingCount) },
          { label: "Pirkėjų signalai", value: String(buyerIntentCount) },
          { label: "Peržiūros", value: String(liveAnalytics.views) },
        ]}
      />

      <SegmentedTabs
        items={tabs}
        value={tab}
        onChange={setTab}
        ariaLabel="Verslo kabineto skirtukai"
        className="mb-4"
      />

      {tab === "overview" && (
        <>
          <BuyerIntentBanner intentCount={buyerIntentCount} />
          <SoldPromptBanner
            listings={listings}
            dismissedIds={soldPromptDismissed}
            onMarkSold={onMarkSold}
            onRenew={onRenew}
            onDismiss={dismissSoldPrompt}
          />
          <B2BAnalyticsPanel analytics={liveAnalytics} />
          <BusinessMarketInsights
            listings={listings}
            allListings={allListings}
            buyerIntentCount={buyerIntentCount}
            onPromoteListing={handlePromoteFromInsights}
          />
          <Disclosure
            className="mb-4"
            title="Detali skelbimų statistika"
            subtitle="Peržiūros, skambučiai, išsaugojimai, 9:16 dalinimai"
            icon={<LineChart className="h-4 w-4 text-[var(--vauto-primary)]" />}
          >
            <MicroAnalytics
              views={liveAnalytics.views}
              callClicks={liveAnalytics.callClicks}
              saves={liveAnalytics.saves}
              chatStarts={liveAnalytics.chatStarts}
              interestScore={liveAnalytics.interestScore}
              shareStory={liveAnalytics.shareStory}
            />
            <CallAndSellWidget
              views={liveAnalytics.views}
              callClicks={liveAnalytics.callClicks}
              saves={liveAnalytics.saves}
              chatStarts={liveAnalytics.chatStarts}
            />
          </Disclosure>
        </>
      )}

      {tab === "listings" && (
        <section>
          <div className="space-y-3">
            {listings.length === 0 ? (
              <p className="vauto-panel p-8 text-center text-sm text-[var(--vauto-text-muted)]">
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
                    autoOpenPromote={promoteTargetId === l.id}
                    onPromoteOpened={() => setPromoteTargetId(null)}
                    onEdit={() => onEdit(l)}
                    onDelete={() => onDelete(l.id)}
                    onRenew={() => onRenew(l.id)}
                  />
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {tab === "pricing" && (
        <>
          <VautoWallet
            balance={user.walletBalance ?? 0}
            onTopUp={onTopUp}
            demoTopUp={apiActive && !stripeEnabled}
            topUpDisabled={apiActive && stripeEnabled}
          />
          {user.role === "pro" && (
            <B2BPlanCreditsCard
              user={user}
              activeJobListings={activeJobListings}
              onOpenCheckout={openCheckout}
            />
          )}
          <B2BBillingCard
            balance={user.walletBalance ?? 0}
            clicks={liveAnalytics.views}
            callClicks={liveAnalytics.callClicks}
            activeListings={listings.length}
            currentPlan={user.billingPlan}
            onOpenCheckout={openCheckout}
            stripeEnabled={stripeEnabled}
          />
          <VisibilityPricingCard
            listings={listings}
            allListings={allListings}
            user={user}
          />
          <BulkUploadCard />
        </>
      )}

      {tab === "services" && showServices && (
        <>
          <ServiceLeadInbox
            balance={user.walletBalance ?? 0}
            user={user}
            rating={serviceRating}
          />
          <ServiceCalendar bookings={mockServiceBookings()} />
        </>
      )}
    </div>
  );
}
