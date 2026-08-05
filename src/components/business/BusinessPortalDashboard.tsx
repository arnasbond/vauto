"use client";

import { useMemo, Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { ProBusinessDashboard } from "@/components/dashboard/ProBusinessDashboard";
import { Badge, Card } from "@/design-system";
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
    () =>
      myListings.filter((l) => l.category === "jobs" && l.status !== "sold")
        .length,
    [myListings]
  );

  return (
    <div
      className="mx-auto w-full max-w-lg px-4 pb-8 md:max-w-5xl md:px-0"
      data-verslui-cockpit-7
    >
      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-[family-name:var(--font-outfit)] text-2xl font-bold tracking-tight text-[var(--ds-text-primary)]">
            Verslo portalas
          </h1>
          <Badge tone="premium">B2B Cockpit</Badge>
        </div>
        <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
          Analitika, skelbimai, masinis įkėlimas ir AI pardavimų rekomendacijos
        </p>
        <Link
          href="/profile/"
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--ds-brand)] hover:underline"
        >
          ← Profilis
        </Link>
      </header>

      <Card
        variant="muted"
        className="mb-4 flex flex-wrap items-center gap-2 py-3"
      >
        <Building2
          className="h-4 w-4 shrink-0 text-[var(--ds-brand)]"
          aria-hidden
        />
        <span className="min-w-0 flex-1 text-xs text-[var(--ds-text-muted)]">
          Čia tik verslo įrankiai. Asmeniniai nustatymai ir paieškos alertai —{" "}
          <Link
            href="/profile/settings/"
            className="font-semibold text-[var(--ds-brand)] underline-offset-2 hover:underline"
          >
            Nustatymuose
          </Link>
          . Kairysis meniu: Apžvalga, Skelbimai, Analitika, Leads, Importas, AI,
          Planas.
        </span>
      </Card>

      <Suspense
        fallback={
          <p className="py-8 text-center text-sm text-[var(--ds-text-muted)]">
            Kraunamas verslo kabinetas…
          </p>
        }
      >
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
      </Suspense>

      <p className="mt-6 text-center text-xs text-[var(--ds-text-muted)]">
        <Link
          href="/mano-skelbimai/"
          className="inline-flex items-center gap-1 font-semibold text-[var(--ds-brand)] underline-offset-2 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Mano skelbimai
        </Link>
      </p>
    </div>
  );
}
