"use client";

import { CallAndSellWidget } from "@/components/dashboard/CallAndSellWidget";
import { ProUpsellCard } from "@/components/dashboard/ProUpsellCard";
import { BuyerIntentBanner } from "@/components/dashboard/BuyerIntentBanner";
import { SoldPromptBanner } from "@/components/dashboard/SoldPromptBanner";
import { PrivateListingCard } from "@/components/dashboard/PrivateListingCard";
import { useVauto } from "@/context/VautoContext";
import type { Listing } from "@/lib/types";

interface PrivateSellerDashboardProps {
  listings: Listing[];
  onEdit: (listing: Listing) => void;
  onDelete: (id: string) => void;
  onMarkSold: (id: string) => void;
  onRenew: (id: string) => void;
}

export function PrivateSellerDashboard({
  listings,
  onEdit,
  onDelete,
  onMarkSold,
  onRenew,
}: PrivateSellerDashboardProps) {
  const {
    sellerAnalytics,
    buyerIntentCount,
    soldPromptDismissed,
    dismissSoldPrompt,
  } = useVauto();

  return (
    <div>
      <ProUpsellCard />

      {listings.length > 0 && (
        <CallAndSellWidget
          views={sellerAnalytics.views}
          callClicks={sellerAnalytics.callClicks}
          saves={sellerAnalytics.saves}
          chatStarts={sellerAnalytics.chatStarts}
        />
      )}

      <BuyerIntentBanner intentCount={buyerIntentCount} />

      <SoldPromptBanner
        listings={listings}
        dismissedIds={soldPromptDismissed}
        onMarkSold={onMarkSold}
        onRenew={onRenew}
        onDismiss={dismissSoldPrompt}
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Mano skelbimai
        </h2>
        {listings.length === 0 ? (
          <p className="vauto-dashboard-card rounded-2xl py-10 text-center text-sm text-slate-500">
            Dar neturite skelbimų. Paspauskite + ir sukurkite pirmąjį.
          </p>
        ) : (
          <div className="space-y-3">
            {listings.map((l) => (
              <PrivateListingCard
                key={l.id}
                listing={l}
                onEdit={() => onEdit(l)}
                onDelete={() => onDelete(l.id)}
                onMarkSold={() => onMarkSold(l.id)}
                onRenew={() => onRenew(l.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
