"use client";

import { MicroAnalytics } from "@/components/dashboard/MicroAnalytics";
import { ProListingCard } from "@/components/dashboard/ProListingCard";
import { ServiceCalendar } from "@/components/dashboard/ServiceCalendar";
import { VautoWallet } from "@/components/dashboard/VautoWallet";
import { mockAggregateAnalytics, mockServiceBookings } from "@/lib/dashboard-mock";
import type { Listing, UserProfile } from "@/lib/types";

interface ProBusinessDashboardProps {
  user: UserProfile;
  listings: Listing[];
  onEdit: (listing: Listing) => void;
  onDelete: (id: string) => void;
  onTopUp: (amount: number) => void;
  onPromote: (listingId: string, cost: number) => boolean;
}

export function ProBusinessDashboard({
  user,
  listings,
  onEdit,
  onDelete,
  onTopUp,
  onPromote,
}: ProBusinessDashboardProps) {
  const analytics = mockAggregateAnalytics(listings);
  const showCalendar =
    user.businessType === "services" ||
    listings.some((l) => l.category === "services");

  return (
    <div>
      <MicroAnalytics
        views={analytics.views}
        clicks={analytics.clicks}
        interestScore={analytics.interestScore}
      />
      <VautoWallet
        balance={user.walletBalance ?? 0}
        onTopUp={onTopUp}
      />
      {showCalendar && <ServiceCalendar bookings={mockServiceBookings()} />}

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
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
