"use client";



import { useMemo, useState } from "react";

import { Briefcase, LayoutGrid, UserRound } from "lucide-react";

import { AiListingAdvisorModal } from "@/components/dashboard/AiListingAdvisorModal";

import { DashboardListingCard } from "@/components/dashboard/DashboardListingCard";

import { sortListingsForDashboard } from "@/components/dashboard/JobApplicationsInbox";

import { ProBusinessDashboard } from "@/components/dashboard/ProBusinessDashboard";

import { PrivateSellerDashboard } from "@/components/dashboard/PrivateSellerDashboard";

import { SmartPromoteModal } from "@/components/dashboard/SmartPromoteModal";

import { WardrobeCabinetSection } from "@/components/clothing/WardrobeCabinetSection";

import { useVauto } from "@/context/VautoContext";

import { togglePauseStatus } from "@/lib/listing-visibility";

import { isWardrobeChameleonActive } from "@/lib/wardrobe-cabinet-mode";

import type { Listing, UserProfile } from "@/lib/types";



interface DashboardPageProps {
  user: UserProfile;
  listings: Listing[];
  allListings: Listing[];
  onRenew: (id: string) => void;
  /** Rodyti tik „Mano skelbimai“ — analitika profilyje slepiama accordion'e */
  listingsOnly?: boolean;
}



export function DashboardPage({ user, listings, allListings, onRenew, listingsOnly = false }: DashboardPageProps) {

  const {

    deleteListing,

    updateListing,

    markListingSold,

    topUpWallet,

    startEditListingFlow,

    showToast,

    openCheckout,

    chameleonTheme,

    detectedAdaptiveKey,

    searchQuery,

    chats,

    wardrobeSpintaForced,

  } = useVauto();



  const [aiTarget, setAiTarget] = useState<Listing | null>(null);

  const [promoteTarget, setPromoteTarget] = useState<Listing | null>(null);



  const sorted = useMemo(() => sortListingsForDashboard(listings), [listings]);

  const wardrobeMode = useMemo(
    () =>
      isWardrobeChameleonActive({
        chameleonTheme,
        detectedAdaptiveKey,
        searchQuery,
        listings,
        spintaForced: wardrobeSpintaForced,
      }),
    [chameleonTheme, detectedAdaptiveKey, searchQuery, listings, wardrobeSpintaForced]
  );

  const isEmployer = user.role === "pro";

  const activeJobListings = useMemo(

    () => listings.filter((l) => l.category === "jobs" && l.status !== "sold").length,

    [listings]

  );



  const handleToggleActive = (listing: Listing) => {

    const next = togglePauseStatus(listing.status);

    updateListing(listing.id, { status: next });

    showToast(

      next === "paused" ? "Skelbimas paslėptas iš paieškos" : "Skelbimas vėl aktyvus",

      "success"

    );

  };



  const listingGrid = wardrobeMode ? (
    <WardrobeCabinetSection
      user={user}
      listings={sorted}
      chats={chats}
      onEdit={(listing) => startEditListingFlow(listing)}
      onMarkSold={(listing) => markListingSold(listing.id)}
    />
  ) : (
    <section className={listingsOnly ? "mt-2" : "mt-6"}>

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

      {!listingsOnly && !wardrobeMode && (
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] p-4">

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
      )}

      {listingsOnly ? (
        listingGrid
      ) : isEmployer ? (

        <>

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

          {listingGrid}

        </>

      ) : wardrobeMode ? (

        listingGrid

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

          onClose={() => setPromoteTarget(null)}

          onOpenCheckout={openCheckout}

        />

      )}

    </div>

  );

}


