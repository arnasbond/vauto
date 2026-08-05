"use client";

import { useMemo, useState } from "react";
import {
  LayoutGrid,
  Sparkles,
} from "lucide-react";
import { Badge, StatCard } from "@/design-system";
import { getListingMetrics } from "@/lib/listing-analytics";
import { dashboardListingState } from "@/lib/listing-visibility";
import { copyListingLink } from "@/lib/social-share";
import { useVauto } from "@/context/VautoContext";
import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";
import { ListingManagementCard } from "@/components/dashboard/ListingManagementCard";
import type { Listing } from "@/lib/types";

interface ManoSkelbimaiDashboardProps {
  listings: Listing[];
}

export function ManoSkelbimaiDashboard({
  listings,
}: ManoSkelbimaiDashboardProps) {
  const {
    deleteListing,
    permanentlyDeleteListing,
    restoreListing,
    updateListing,
    markListingSold,
    startEditListingFlow,
    showToast,
    showConfirm,
  } = useVauto();
  const { openMicroPayment } = useZeroUiScreen();
  const [statsTarget, setStatsTarget] = useState<Listing | null>(null);

  const sorted = useMemo(
    () =>
      [...listings].sort((a, b) => {
        const order = {
          active: 0,
          pending: 1,
          paused: 2,
          expired: 3,
          sold: 4,
          deleted: 5,
        };
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

  const kpis = useMemo(() => {
    const active = sorted.filter(
      (l) =>
        l.status !== "sold" &&
        l.status !== "deleted" &&
        l.status !== "paused"
    ).length;
    let views = 0;
    let contacts = 0;
    let sales = 0;
    for (const l of sorted) {
      const m = getListingMetrics(l);
      views += m.views;
      contacts += m.callClicks + m.chatStarts;
      if (l.status === "sold") sales += 1;
    }
    return { active, views, contacts, sales };
  }, [sorted]);

  const handleHide = async (listing: Listing) => {
    const ok = await showConfirm({
      title: "Paslėpti skelbimą?",
      message: `„${listing.title}" bus paslėptas iš viešo katalogo. Galėsite jį atkurti vėliau.`,
      confirmLabel: "Paslėpti",
      cancelLabel: "Atšaukti",
    });
    if (!ok) return;
    deleteListing(listing.id);
    showToast("Skelbimas paslėptas — galite atkurti iš šio sąrašo", "success");
  };

  const handlePermanentDelete = async (listing: Listing) => {
    const ok = await showConfirm({
      title: "Ištrinti skelbimą visam laikui?",
      message:
        "Ar tikrai norite ištrinti skelbimą visam laikui? Šio veiksmo atšaukti negalėsite.",
      confirmLabel: "Ištrinti",
      cancelLabel: "Atšaukti",
      variant: "danger",
    });
    if (!ok) return;
    const deleted = await permanentlyDeleteListing(listing.id);
    if (deleted) {
      showToast("Skelbimas ištrintas visam laikui", "success");
    } else {
      showToast("Nepavyko ištrinti skelbimo", "error");
    }
  };

  const handleRestore = async (listing: Listing) => {
    await restoreListing(listing.id);
    showToast("Skelbimas atkurtas ir vėl matomas kataloge", "success");
  };

  const handleMarkSold = async (listing: Listing) => {
    const ok = await showConfirm({
      title: "Pažymėti kaip parduotą?",
      message: `„${listing.title}" nebebus rodomas kataloge.`,
      confirmLabel: "Parduota",
      cancelLabel: "Atšaukti",
    });
    if (!ok) return;
    markListingSold(listing.id);
    showToast("Skelbimas pažymėtas kaip parduotas", "success");
  };

  const handleStats = (listing: Listing) => {
    setStatsTarget(listing);
    const m = getListingMetrics(listing);
    showToast(
      `Peržiūros: ${m.views} · Skambučiai: ${m.callClicks} · Pokalbiai: ${m.chatStarts} · Išsaugota: ${m.saves}`,
      "info"
    );
  };

  const handleShare = async (listing: Listing) => {
    const ok = await copyListingLink(listing);
    showToast(
      ok ? "Nuoroda nukopijuota" : "Nepavyko nukopijuoti nuorodos",
      ok ? "success" : "error"
    );
  };

  const handleAiOptimize = async (listing: Listing) => {
    const ok = await showConfirm({
      title: "AI Optimizuoti?",
      message:
        "AI dvynys padės atsakyti pirkėjams ir pagerinti skelbimo matomumą. Norėsite tęsti?",
      confirmLabel: "Taip, tęsti",
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
    showToast("Atidarau AI optimizavimą", "info");
    if (!listing.minNegotiationPrice) {
      showToast(
        "Patarimas: nustatykite minimalią kainą, kad AI žinotų ribas.",
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
    <section className="pb-8" data-mano-skelbimai-2>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-[family-name:var(--font-outfit)] text-2xl font-bold tracking-tight text-[var(--ds-text-primary,var(--vauto-ink))]">
          <LayoutGrid className="h-6 w-6 text-[var(--ds-brand,var(--vauto-primary))]" />
          Mano skelbimai
        </h1>
        {kpis.active > 0 ? (
          <Badge tone="brand">{kpis.active} aktyvūs</Badge>
        ) : null}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Aktyvūs skelbimai"
          value={String(kpis.active)}
          hint="Viešame kataloge"
        />
        <StatCard
          label="Peržiūros"
          value={String(kpis.views)}
          hint="Visų skelbimų suma"
          trend={kpis.views > 0 ? "up" : "flat"}
        />
        <StatCard
          label="Kontaktai / Žinutės"
          value={String(kpis.contacts)}
          hint="Skambučiai + pokalbiai"
        />
        <StatCard
          label="Pardavimai"
          value={String(kpis.sales)}
          hint="Pažymėti parduotu"
          trend={kpis.sales > 0 ? "up" : "flat"}
        />
      </div>

      <p className="mb-6 text-sm text-[var(--ds-text-secondary,var(--vauto-body))]">
        Valdykite visus skelbimus vienoje vietoje. Primary veiksmas —
        „Redaguoti“; papildomi veiksmai — statistika, AI ir dalijimasis.
      </p>

      {sorted.length === 0 ? (
        <div className="rounded-[var(--ds-radius-card)] border border-dashed border-[var(--ds-border-strong)] bg-[var(--ds-surface-muted)] px-6 py-16 text-center">
          <Sparkles className="mx-auto mb-3 h-10 w-10 text-[var(--ds-ai-strong)]" />
          <p className="text-sm text-[var(--ds-text-muted)]">
            Dar neturite skelbimų — pradėkite pokalbį pagrindiniame puslapyje ir
            DI paruoš skelbimą už jus.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {sorted.map((listing) => (
            <ListingManagementCard
              key={listing.id}
              listing={listing}
              onEdit={() =>
                startEditListingFlow(listing, { stayOnPage: true })
              }
              onStats={() => handleStats(listing)}
              onAiOptimize={() => void handleAiOptimize(listing)}
              onShare={() => void handleShare(listing)}
              onMarkSold={() => void handleMarkSold(listing)}
              onHide={() => void handleHide(listing)}
              onDelete={() => void handleHide(listing)}
              onRestore={() => void handleRestore(listing)}
              onPermanentDelete={() => void handlePermanentDelete(listing)}
            />
          ))}
        </div>
      )}

      {statsTarget ? (
        <span className="sr-only" aria-live="polite">
          Statistika: {statsTarget.title}
        </span>
      ) : null}
    </section>
  );
}
