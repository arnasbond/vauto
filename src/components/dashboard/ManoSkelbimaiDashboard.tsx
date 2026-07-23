"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  ExternalLink,
  LayoutGrid,
  Pause,
  Pencil,
  Sparkles,
  Trash2,
  TrendingUp,
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
import { listingPath } from "@/lib/seo";
import { useVauto } from "@/context/VautoContext";
import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";
import { SmartPromoteModal } from "@/components/dashboard/SmartPromoteModal";
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
  onBoost,
}: {
  listing: Listing;
  onPause: () => void;
  onDelete: () => void;
  onStats: () => void;
  onEdit: () => void;
  onActivateAiTwin: () => void;
  onBoost: () => void;
}) {
  const state = dashboardListingState(listing);
  const isPaused = listing.status === "paused";
  // Always use query `id` — static export has no /listing/[slug] HTML for new posts.
  const publicHref = listing.id?.trim()
    ? `/listing/?id=${encodeURIComponent(listing.id.trim())}`
    : listingPath(listing);

  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <Link
        href={publicHref}
        className="relative block aspect-[4/3] overflow-hidden bg-slate-100"
      >
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
      </Link>

      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">
          {listing.title}
        </h3>
        <p className="mt-1 text-base font-bold text-blue-800">
          {formatPrice(listing.price, listing.priceLabel)}
        </p>

        <div className="listing-card-actions mt-3">
          <Link
            href={publicHref}
            className="listing-card-btn listing-card-btn--secondary listing-card-btn--span2"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Peržiūrėti skelbimą
          </Link>

          {!listing.isAiTwinActive ? (
            <button
              type="button"
              onClick={onActivateAiTwin}
              className="listing-card-btn listing-card-btn--ai listing-card-btn--span2"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Aktyvuoti AI derybininką
            </button>
          ) : (
            <div className="listing-card-btn listing-card-btn--ai listing-card-btn--span2 cursor-default">
              AI derybininkas aktyvus
            </div>
          )}

          <button
            type="button"
            onClick={onEdit}
            className="listing-card-btn listing-card-btn--primary"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Redaguoti
          </button>
          <button
            type="button"
            onClick={onBoost}
            disabled={state === "sold"}
            className="listing-card-btn listing-card-btn--accent"
          >
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            Iškelti
          </button>

          <button
            type="button"
            onClick={onStats}
            className="listing-card-btn listing-card-btn--secondary"
          >
            <BarChart3 className="h-3.5 w-3.5" aria-hidden />
            Statistika
          </button>
          <button
            type="button"
            onClick={onPause}
            disabled={state === "sold"}
            className="listing-card-btn listing-card-btn--secondary"
          >
            <Pause className="h-3.5 w-3.5" aria-hidden />
            {isPaused ? "Aktyvuoti" : "Stabdyti"}
          </button>

          <button
            type="button"
            onClick={onDelete}
            className="listing-card-btn listing-card-btn--danger listing-card-btn--span2"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Ištrinti
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
    openCheckout,
  } = useVauto();
  const { openMicroPayment } = useZeroUiScreen();
  const [statsTarget, setStatsTarget] = useState<Listing | null>(null);
  const [promoteListing, setPromoteListing] = useState<Listing | null>(null);

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
      title: "Aktyvuoti AI dvynį?",
      message:
        "AI dvynys atsakys tik šablonais (ar dar aktualu, kainos riba) ir prireikus perduos pokalbį jums. Norėsite tęsti aktyvavimą?",
      confirmLabel: "Taip, aktyvuoti",
      cancelLabel: "Atšaukti",
    });
    if (!ok) return;
    openMicroPayment({
      reason:
        "AI dvynys — šabloniniai atsakymai + perdavimas žmogui pagal jūsų minimalią kainą.",
      price: 4.99,
      product: "generic",
      voiceConfirmPhrase: "Taip, apmokėti",
      metadata: { kind: "ai_twin", listingId: listing.id },
    });
    showToast("Atidarau AI dvynio aktyvavimą", "info");
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
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-slate-900">
          <LayoutGrid className="h-6 w-6 text-blue-800" />
          Mano skelbimai
        </h1>
        {activeCount > 0 && (
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
            {activeCount} aktyvūs
          </span>
        )}
      </div>

      <p className="mb-6 text-sm text-slate-600">
        Valdykite visus skelbimus vienoje vietoje — privatūs ir verslo klientai
        naudoja tą pačią sistemą. Redaguokite pokalbiu su DI, be formų.
      </p>

      {sorted.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center">
          <Sparkles className="mx-auto mb-3 h-10 w-10 text-teal-600" />
          <p className="text-sm text-slate-600">
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
              onEdit={() => startEditListingFlow(listing, { stayOnPage: true })}
              onActivateAiTwin={() => void handleActivateAiTwin(listing)}
              onBoost={() => setPromoteListing(listing)}
            />
          ))}
        </div>
      )}

      {statsTarget && (
        <span className="sr-only" aria-live="polite">
          Statistika: {statsTarget.title}
        </span>
      )}

      {promoteListing ? (
        <SmartPromoteModal
          open
          listing={promoteListing}
          onClose={() => setPromoteListing(null)}
          onOpenCheckout={openCheckout}
        />
      ) : null}
    </section>
  );
}
