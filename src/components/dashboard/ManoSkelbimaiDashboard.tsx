"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  BarChart3,
  LayoutGrid,
  Pause,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import { formatPrice } from "@/data/mockListings";
import { getListingCoverImage } from "@/lib/listing-image";
import { getListingMetrics } from "@/lib/listing-analytics";
import {
  dashboardListingState,
  dashboardStateClass,
  dashboardStateLabel,
  togglePauseStatus,
} from "@/lib/listing-visibility";
import { useVauto } from "@/context/VautoContext";
import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/cn";

interface ManoSkelbimaiDashboardProps {
  listings: Listing[];
}

function ManoSkelbimaiCard({
  listing,
  onPause,
  onDelete,
  onStats,
  onEdit,
  onActivateAiTwin,
}: {
  listing: Listing;
  onPause: () => void;
  onDelete: () => void;
  onStats: () => void;
  onEdit: () => void;
  onActivateAiTwin: () => void;
}) {
  const state = dashboardListingState(listing);
  const isPaused = listing.status === "paused";

  return (
    <article className="group overflow-hidden rounded-2xl border border-[var(--anonser-border)] bg-[var(--anonser-card)] shadow-sm transition hover:shadow-md">
      <div className="relative aspect-[4/3] overflow-hidden bg-[var(--anonser-surface-muted)]">
        <Image
          src={getListingCoverImage(listing)}
          alt={listing.title}
          fill
          sizes="(max-width: 768px) 50vw, 25vw"
          className="object-cover transition duration-300 group-hover:scale-[1.02]"
        />
        <span
          className={cn(
            "absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold",
            dashboardStateClass(state)
          )}
        >
          {dashboardStateLabel(state)}
        </span>
      </div>

      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-semibold text-[var(--anonser-text)]">
          {listing.title}
        </h3>
        <p className="mt-1 text-base font-bold text-[var(--anonser-primary)]">
          {formatPrice(listing.price, listing.priceLabel)}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {!listing.isAiTwinActive ? (
            <button
              type="button"
              onClick={onActivateAiTwin}
              className="col-span-2 flex items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Aktyvuoti AI derybininką
            </button>
          ) : (
            <div className="col-span-2 flex items-center justify-center rounded-xl bg-emerald-50 py-2 text-[11px] font-semibold text-emerald-800">
              AI derybininkas aktyvus
            </div>
          )}
          <button
            type="button"
            onClick={onPause}
            disabled={state === "sold"}
            className="flex items-center justify-center gap-1 rounded-xl border border-[var(--anonser-border)] py-2 text-xs font-medium text-[var(--anonser-text)] transition hover:bg-[var(--anonser-surface-muted)] disabled:opacity-40"
          >
            <Pause className="h-3.5 w-3.5" />
            {isPaused ? "Aktyvuoti" : "Stabdyti"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center justify-center gap-1 rounded-xl bg-red-50 py-2 text-xs font-medium text-red-700 transition hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Ištrinti
          </button>
          <button
            type="button"
            onClick={onStats}
            className="flex items-center justify-center gap-1 rounded-xl bg-[var(--anonser-primary-soft)] py-2 text-xs font-medium text-[var(--anonser-primary)] transition hover:opacity-90"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Statistika
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center justify-center gap-1 rounded-xl bg-[var(--anonser-primary)] py-2 text-xs font-semibold text-white transition hover:opacity-95"
          >
            <Pencil className="h-3.5 w-3.5" />
            Redaguoti
          </button>
        </div>
      </div>
    </article>
  );
}

export function ManoSkelbimaiDashboard({
  listings,
}: ManoSkelbimaiDashboardProps) {
  const {
    deleteListing,
    updateListing,
    startEditListingFlow,
    showToast,
    showConfirm,
  } = useVauto();
  const { openMicroPayment } = useZeroUiScreen();
  const [statsTarget, setStatsTarget] = useState<Listing | null>(null);

  const sorted = useMemo(
    () =>
      [...listings].sort((a, b) => {
        const order = { active: 0, pending: 1, paused: 2, expired: 3, sold: 4 };
        const sa = order[dashboardListingState(a)];
        const sb = order[dashboardListingState(b)];
        if (sa !== sb) return sa - sb;
        return (
          new Date(b.createdAt ?? 0).getTime() -
          new Date(a.createdAt ?? 0).getTime()
        );
      }),
    [listings]
  );

  const activeCount = sorted.filter((l) => l.status !== "sold").length;

  const handleDelete = async (listing: Listing) => {
    const ok = await showConfirm({
      title: "Ištrinti skelbimą?",
      message: `„${listing.title}" bus pašalintas negrįžtamai.`,
      confirmLabel: "Ištrinti",
      cancelLabel: "Atšaukti",
    });
    if (!ok) return;
    deleteListing(listing.id);
    showToast("Skelbimas ištrintas", "success");
  };

  const handlePause = (listing: Listing) => {
    const next = togglePauseStatus(listing.status);
    updateListing(listing.id, { status: next });
    showToast(
      next === "paused" ? "Skelbimas sustabdytas" : "Skelbimas vėl aktyvus",
      "success"
    );
  };

  const handleStats = (listing: Listing) => {
    setStatsTarget(listing);
    const m = getListingMetrics(listing);
    showToast(
      `Peržiūros: ${m.views} · Skambučiai: ${m.callClicks} · Pokalbiai: ${m.chatStarts} · Išsaugota: ${m.saves}`,
      "info"
    );
  };

  const handleActivateAiTwin = async (listing: Listing) => {
    const ok = await showConfirm({
      title: "Aktyvuoti AI derybininką?",
      message:
        "AI Dvynys–Derybininkas 24/7 automatiškai derėsis su pirkėjais pagal jūsų minimalią kainą. Norėsite tęsti aktyvavimą?",
      confirmLabel: "Taip, aktyvuoti",
      cancelLabel: "Atšaukti",
    });
    if (!ok) return;
    openMicroPayment({
      reason:
        "AI Dvynys–Derybininkas — 24/7 automatiškos derybos su pirkėjais pagal jūsų minimalią kainą.",
      price: 4.99,
      product: "generic",
      voiceConfirmPhrase: "Taip, apmokėti",
      metadata: { kind: "ai_twin", listingId: listing.id },
    });
    showToast("Atidarau AI derybininko aktyvavimą", "info");
    if (!listing.minNegotiationPrice) {
      showToast(
        "Patarimas: nustatykite minimalią kainą (minNegotiationPrice), kad dvynys žinotų ribas.",
        "info"
      );
    }
    updateListing(listing.id, {
      attributes: {
        ...(listing.attributes ?? {}),
        isAiTwinActive: "true",
      },
    });
  };

  return (
    <section className="pb-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-[var(--anonser-text)]">
          <LayoutGrid className="h-6 w-6 text-[var(--anonser-primary)]" />
          Mano skelbimai
        </h1>
        {activeCount > 0 && (
          <span className="rounded-full bg-[var(--anonser-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--anonser-primary)]">
            {activeCount} aktyvūs
          </span>
        )}
      </div>

      <p className="mb-6 text-sm text-[var(--anonser-text-muted)]">
        Valdykite visus skelbimus vienoje vietoje — privatūs ir verslo klientai
        naudoja tą pačią sistemą. Redaguokite pokalbiu su DI, be formų.
      </p>

      {sorted.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--anonser-border)] bg-[var(--anonser-surface-muted)]/40 px-6 py-16 text-center">
          <Sparkles className="mx-auto mb-3 h-10 w-10 text-[var(--anonser-accent)]" />
          <p className="text-sm text-[var(--anonser-text-muted)]">
            Dar neturite skelbimų — pradėkite pokalbį pagrindiniame puslapyje ir
            DI paruoš skelbimą už jus.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {sorted.map((listing) => (
            <ManoSkelbimaiCard
              key={listing.id}
              listing={listing}
              onPause={() => handlePause(listing)}
              onDelete={() => void handleDelete(listing)}
              onStats={() => handleStats(listing)}
              onEdit={() => startEditListingFlow(listing)}
              onActivateAiTwin={() => void handleActivateAiTwin(listing)}
            />
          ))}
        </div>
      )}

      {statsTarget && (
        <span className="sr-only" aria-live="polite">
          Statistika: {statsTarget.title}
        </span>
      )}
    </section>
  );
}
