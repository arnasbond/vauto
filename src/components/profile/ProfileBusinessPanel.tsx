"use client";

import { useMemo } from "react";
import { PrivateSellerDashboard } from "@/components/dashboard/PrivateSellerDashboard";
import { ProBusinessDashboard } from "@/components/dashboard/ProBusinessDashboard";
import { useProfileViewMode } from "@/lib/profile-view";
import { useVauto } from "@/context/VautoContext";
import type { Listing, UserProfile } from "@/lib/types";

interface ProfileBusinessPanelProps {
  user: UserProfile;
  listings: Listing[];
  allListings: Listing[];
  onRenew: (id: string) => void;
}

export function ProfileBusinessPanel({
  user,
  listings,
  allListings,
  onRenew,
}: ProfileBusinessPanelProps) {
  const { deleteListing, markListingSold, topUpWallet, startEditListingFlow } = useVauto();
  const isPro = user.role === "pro";
  const { showBusinessUi } = useProfileViewMode(isPro);
  const activeJobListings = useMemo(
    () => listings.filter((l) => l.category === "jobs" && l.status !== "sold").length,
    [listings]
  );

  if (showBusinessUi) {
    return (
      <ProBusinessDashboard
        user={user}
        listings={listings}
        allListings={allListings}
        activeJobListings={activeJobListings}
        onEdit={(l) => startEditListingFlow(l)}
        onDelete={(id) => {
          if (confirm("Ištrinti skelbimą?")) deleteListing(id);
        }}
        onMarkSold={markListingSold}
        onTopUp={topUpWallet}
        onRenew={onRenew}
      />
    );
  }

  return (
    <PrivateSellerDashboard
      listings={listings}
      onEdit={(l) => startEditListingFlow(l)}
      onDelete={(id) => {
        if (confirm("Ištrinti skelbimą?")) deleteListing(id);
      }}
      onMarkSold={markListingSold}
      onRenew={onRenew}
      hideListingSection
    />
  );
}
