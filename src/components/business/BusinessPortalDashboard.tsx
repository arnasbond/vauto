"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { ProBusinessDashboard } from "@/components/dashboard/ProBusinessDashboard";
import { PageHeader } from "@/components/ui/surface";
import { useVauto } from "@/context/VautoContext";
import type { UserProfile } from "@/lib/types";

interface BusinessPortalDashboardProps {
  user: UserProfile;
}

/**
 * Dedicated business tools shell for /verslui — analytics, listings, billing, bulk.
 * Personal buyer tools (wishlist / search alerts) stay out of this view.
 */
export function BusinessPortalDashboard({ user }: BusinessPortalDashboardProps) {
  const {
    listings,
    deleteListing,
    markListingSold,
    topUpWallet,
    startEditListingFlow,
    renewListing,
  } = useVauto();

  const myListings = useMemo(
    () => listings.filter((l) => l.sellerId === user.id),
    [listings, user.id]
  );
  const activeJobListings = useMemo(
    () => myListings.filter((l) => l.category === "jobs" && l.status !== "sold").length,
    [myListings]
  );

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-8 md:max-w-5xl md:px-0">
      <PageHeader
        title="Verslo portalas"
        subtitle="Analitika, skelbimai, masinis įkėlimas ir atsiskaitymai"
        backHref="/profile/"
        backLabel="Profilis"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--vauto-primary)_20%,transparent)] bg-[color-mix(in_srgb,var(--vauto-primary)_6%,transparent)] px-3 py-2.5 text-xs text-[var(--vauto-text-muted)]">
        <Building2 className="h-4 w-4 shrink-0 text-[var(--vauto-primary)]" aria-hidden />
        <span className="min-w-0 flex-1">
          Čia tik verslo įrankiai. Asmeniniai nustatymai ir paieškos alertai —{" "}
          <Link
            href="/profile/settings/"
            className="font-semibold text-[var(--vauto-primary)] underline-offset-2 hover:underline"
          >
            Nustatymuose
          </Link>
          .
        </span>
      </div>

      <ProBusinessDashboard
        user={user}
        listings={myListings}
        allListings={listings}
        activeJobListings={activeJobListings}
        onEdit={(l) => startEditListingFlow(l)}
        onDelete={(id) => {
          if (confirm("Ištrinti skelbimą?")) deleteListing(id);
        }}
        onMarkSold={markListingSold}
        onTopUp={topUpWallet}
        onRenew={(id) => void renewListing(id)}
      />

      <p className="mt-6 text-center text-xs text-[var(--vauto-text-muted)]">
        <Link
          href="/mano-skelbimai/"
          className="inline-flex items-center gap-1 font-semibold text-[var(--vauto-primary)] underline-offset-2 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Mano skelbimai
        </Link>
      </p>
    </div>
  );
}
