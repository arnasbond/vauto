"use client";

import { useMemo, useState } from "react";
import { Briefcase, LayoutGrid, UserRound } from "lucide-react";
import { AiListingAdvisorModal } from "@/components/dashboard/AiListingAdvisorModal";
import { DashboardListingCard } from "@/components/dashboard/DashboardListingCard";
import { sortListingsForDashboard } from "@/components/dashboard/JobApplicationsInbox";
import { ProBusinessDashboard } from "@/components/dashboard/ProBusinessDashboard";
import { PrivateSellerDashboard } from "@/components/dashboard/PrivateSellerDashboard";
import { SmartPromoteModal } from "@/components/dashboard/SmartPromoteModal";
import { useVauto } from "@/context/VautoContext";
import { getPromoteSuggestion } from "@/lib/smart-promote";
import { togglePauseStatus } from "@/lib/listing-visibility";
import type { Listing, UserProfile } from "@/lib/types";
import type { VisibilityTierId } from "@/lib/visibility-plans";

interface DashboardPageProps {
  user: UserProfile;
  listings: Listing[];
  allListings: Listing[];
  onRenew: (id: string) => void;
}

export function DashboardPage({ user, listings, allListings, onRenew }: DashboardPageProps) {
  const {
    deleteListing,
    updateListing,
    markListingSold,
    topUpWallet,
    promoteListing,
    startEditListingFlow,
    showToast,
  } = useVauto();

  const [aiTarget, setAiTarget] = useState<Listing | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<Listing | null>(null);

  const sorted = useMemo(() => sortListingsForDashboard(listings), [listings]);
  const isEmployer = user.role === "pro";

  const handleToggleActive = (listing: Listing) => {
    const next = togglePauseStatus(listing.status);
    updateListing(listing.id, { status: next });
    showToast(
      next === "paused" ? "Skelbimas paslėptas iš paieškos" : "Skelbimas vėl aktyvus",
      "success"
    );
  };

  const handlePromote = (listingId: string, cost: number, tierId: VisibilityTierId) => {
    const ok = promoteListing(listingId, cost, tierId);
    if (ok) {
      showToast("Skelbimas iškeltas!", "success");
      setPromoteTarget(null);
    }
    return ok;
  };

  const listingGrid = (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
          <LayoutGrid className="h-4 w-4" />
          Mano skelbimai ({sorted.length})
        </h2>
        <span className="text-[10px] text-[var(--vauto-text-muted)]">
          VIP skelbimai rodomi pirmiau
        </span>
      </div>
      {sorted.length === 0 ? (
        <p className="vauto-dashboard-card rounded-2xl py-10 text-center text-sm text-[var(--vauto-text-muted)]">
          Dar neturite skelbimų. Paspauskite + ir sukurkite pirmąjį.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sorted.map((listing) => (
            <DashboardListingCard
              key={listing.id}
              listing={listing}
              user={user}
              showCvInbox={isEmployer}
              onEdit={() => startEditListingFlow(listing)}
              onToggleActive={() => handleToggleActive(listing)}
              onBoost={() => setPromoteTarget(listing)}
              onAiAdvisor={() => setAiTarget(listing)}
              onMarkSold={() => markListingSold(listing.id)}
              onDelete={() => {
                if (confirm("Ištrinti skelbimą?")) deleteListing(listing.id);
              }}
            />
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="dashboard-page">
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-surface)] p-4">
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${
            isEmployer ? "bg-[var(--vauto-orange)]/15" : "bg-[var(--vauto-teal)]/15"
          }`}
        >
          {isEmployer ? (
            <Briefcase className="h-5 w-5 text-[var(--vauto-orange)]" />
          ) : (
            <UserRound className="h-5 w-5 text-[var(--vauto-teal)]" />
          )}
        </span>
        <div>
          <p className="text-sm font-bold text-[var(--vauto-text)]">
            {isEmployer ? "Verslo kabinetas" : "Pardavėjo kabinetas"}
          </p>
          <p className="text-xs text-[var(--vauto-text-muted)]">
            {isEmployer
              ? "Valdykite skelbimus, CV paraiškas ir matomumą"
              : "Valdykite skelbimus, būsenas ir AI patarimus"}
          </p>
        </div>
      </div>

      {isEmployer ? (
        <>
          <ProBusinessDashboard
            user={user}
            listings={listings}
            allListings={allListings}
            onEdit={(l) => startEditListingFlow(l)}
            onDelete={(id) => {
              if (confirm("Ištrinti skelbimą?")) deleteListing(id);
            }}
            onMarkSold={markListingSold}
            onTopUp={topUpWallet}
            onPromote={promoteListing}
            onRenew={onRenew}
          />
          {listingGrid}
        </>
      ) : (
        <>
          <PrivateSellerDashboard
            listings={[]}
            onEdit={() => {}}
            onDelete={() => {}}
            onMarkSold={() => {}}
            onRenew={onRenew}
            hideListingSection
          />
          {listingGrid}
        </>
      )}

      <AiListingAdvisorModal listing={aiTarget} onClose={() => setAiTarget(null)} />

      {promoteTarget && (
        <SmartPromoteModal
          open
          listing={promoteTarget}
          suggestion={getPromoteSuggestion(promoteTarget, {
            allListings,
            user,
          })}
          walletBalance={user.walletBalance ?? 0}
          onClose={() => setPromoteTarget(null)}
          onConfirm={(tierId, cost) => handlePromote(promoteTarget.id, cost, tierId)}
        />
      )}
    </div>
  );
}
