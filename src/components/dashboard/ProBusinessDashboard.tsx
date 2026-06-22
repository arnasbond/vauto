"use client";

import { CallAndSellWidget } from "@/components/dashboard/CallAndSellWidget";
import { BuyerIntentBanner } from "@/components/dashboard/BuyerIntentBanner";
import { B2BBillingCard } from "@/components/dashboard/B2BBillingCard";
import { BulkUploadCard } from "@/components/dashboard/BulkUploadCard";
import { BusinessIdentityCard } from "@/components/dashboard/BusinessIdentityCard";
import { SoldPromptBanner } from "@/components/dashboard/SoldPromptBanner";
import { ProListingCard } from "@/components/dashboard/ProListingCard";
import { ServiceCalendar } from "@/components/dashboard/ServiceCalendar";
import { ServiceLeadInbox } from "@/components/dashboard/ServiceLeadInbox";
import { VautoWallet } from "@/components/dashboard/VautoWallet";
import { mockAggregateAnalytics, mockServiceBookings } from "@/lib/dashboard-mock";
import { useVauto } from "@/context/VautoContext";
import type { Listing, UserProfile } from "@/lib/types";

interface ProBusinessDashboardProps {
  user: UserProfile;
  listings: Listing[];
  onEdit: (listing: Listing) => void;
  onDelete: (id: string) => void;
  onMarkSold: (id: string) => void;
  onTopUp: (amount: number) => void;
  onPromote: (listingId: string, cost: number) => boolean;
  onRenew: (id: string) => void;
}

export function ProBusinessDashboard({
  user,
  listings,
  onEdit,
  onDelete,
  onMarkSold,
  onTopUp,
  onPromote,
  onRenew,
}: ProBusinessDashboardProps) {
  const { buyerIntentCount, soldPromptDismissed, dismissSoldPrompt } = useVauto();
  const analytics = mockAggregateAnalytics(listings);
  const showCalendar =
    user.businessType === "services" ||
    listings.some((l) => l.category === "services");

  return (
    <div>
      <BusinessIdentityCard user={user} />
      <CallAndSellWidget
        views={analytics.views}
        callClicks={analytics.callClicks}
        saves={analytics.saves}
        chatStarts={analytics.chatStarts}
      />
      <BuyerIntentBanner intentCount={buyerIntentCount} />
      <SoldPromptBanner
        listings={listings}
        dismissedIds={soldPromptDismissed}
        onMarkSold={onMarkSold}
        onRenew={onRenew}
        onDismiss={dismissSoldPrompt}
      />
      <VautoWallet
        balance={user.walletBalance ?? 0}
        onTopUp={onTopUp}
      />
      <B2BBillingCard
        balance={user.walletBalance ?? 0}
        clicks={analytics.views}
        callClicks={analytics.callClicks}
        activeListings={listings.length}
      />
      <BulkUploadCard />
      {showCalendar && (
        <>
          <ServiceLeadInbox balance={user.walletBalance ?? 0} />
          <ServiceCalendar bookings={mockServiceBookings()} />
        </>
      )}

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
              <ProListingCard
                key={l.id}
                listing={l}
                walletBalance={user.walletBalance ?? 0}
                onEdit={() => onEdit(l)}
                onDelete={() => onDelete(l.id)}
                onPromote={onPromote}
                onRenew={() => onRenew(l.id)}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
