"use client";

import { useMemo } from "react";
import {
  Clock,
  Eye,
  ImageIcon,
  MessageCircle,
  TrendingUp,
} from "lucide-react";
import {
  AiInsightCard,
  Badge,
  Card,
  StatCard,
} from "@/design-system";
import { formatPrice } from "@/data/mockListings";
import { getListingMetrics } from "@/lib/listing-analytics";
import { getBusinessMarketOverview } from "@/lib/market-insights";
import { getPriceAdvice } from "@/lib/price-advisor";
import type { SellerListingAnalytics } from "@/lib/seller-listing-analytics";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/cn";

export type BusinessCockpitOverviewProps = {
  listings: Listing[];
  allListings: Listing[];
  analytics: SellerListingAnalytics;
  buyerIntentCount: number;
  walletBalance?: number;
  onOpenAiTips?: () => void;
  /** kpi = StatCard juosta; analytics = trendai + efektyvumas + AI (be KPI) */
  mode?: "kpi" | "analytics" | "full";
  className?: string;
};

function pct(part: number, whole: number): number {
  if (!(whole > 0) || !(part >= 0)) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

/**
 * Business Cockpit 2.0 — KPI, trendai, efektyvumas, AI rekomendacijos.
 * Tik UI; skaičiai iš esamų listing / analytics laukų (be naujos API).
 */
export function BusinessCockpitOverview({
  listings,
  allListings,
  analytics,
  buyerIntentCount,
  walletBalance = 0,
  onOpenAiTips,
  mode = "full",
  className,
}: BusinessCockpitOverviewProps) {
  const derived = useMemo(() => {
    const active = listings.filter(
      (l) => l.status !== "sold" && l.status !== "deleted"
    );
    const sold = listings.filter((l) => l.status === "sold");
    const revenue = sold.reduce((s, l) => s + (Number(l.price) || 0), 0);
    const contacts = analytics.contacts || analytics.callClicks + analytics.chatStarts;
    const conversion = pct(contacts, analytics.views);
    const adSpend = analytics.promoteSpendEur;
    // UI estimate: ~8 min saved per chat + 4 min per listing managed
    const aiMinutes = Math.round(
      analytics.chatStarts * 8 + active.length * 4 + buyerIntentCount * 2
    );

    const highPrice = active.filter((l) => {
      const advice = getPriceAdvice(l, allListings);
      return advice.verdict === "high";
    }).length;
    const weakPhotos = active.filter(
      (l) => (l.images?.filter(Boolean).length ?? 0) < 3
    ).length;

    const byCategory = new Map<
      string,
      { views: number; contacts: number; count: number }
    >();
    for (const l of active) {
      const m = getListingMetrics(l);
      const key = l.category || "other";
      const cur = byCategory.get(key) ?? { views: 0, contacts: 0, count: 0 };
      cur.views += m.views;
      cur.contacts += m.callClicks + m.chatStarts;
      cur.count += 1;
      byCategory.set(key, cur);
    }
    const categoryRows = [...byCategory.entries()]
      .map(([category, row]) => ({
        category,
        ...row,
        conv: pct(row.contacts, row.views),
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);

    const market = getBusinessMarketOverview(
      listings,
      allListings,
      buyerIntentCount
    );

    const priceRows = active.slice(0, 6).map((l) => {
      const advice = getPriceAdvice(l, allListings);
      const median =
        advice.medianPrice ??
        (advice.minPrice != null && advice.maxPrice != null
          ? Math.round((advice.minPrice + advice.maxPrice) / 2)
          : null);
      return {
        id: l.id,
        title: l.title,
        price: l.price,
        median,
        verdict: advice.verdict,
      };
    });

    // Synthetic trend from totals (UI sparkline only — no historical API)
    // REMOVED (F6 Final): fabricated multipliers presented as historical
    // dynamics. Only the REAL current aggregate is shown; trend requires a
    // real time-series endpoint that does not exist yet.
    const trendAvailable = analytics.source === "server" && analytics.views > 0;

    const tips: string[] = [];
    if (highPrice > 0) {
      tips.push(
        `${highPrice} skelbimų kainos aukštesnės už rinkos vidurkį.`
      );
    }
    if (weakPhotos > 0) {
      tips.push(
        `${weakPhotos} skelbimams trūksta geresnės pagrindinės nuotraukos.`
      );
    }
    // No fabricated fallbacks: absent data is stated as absent, never invented.

    return {
      revenue,
      contacts,
      conversion,
      adSpend,
      aiMinutes,
      highPrice,
      weakPhotos,
      categoryRows,
      market,
      priceRows,
      trendAvailable,
      tips,
      soldCount: sold.length,
      activeCount: active.length,
    };
  }, [listings, allListings, analytics, buyerIntentCount]);

  const categoryLabels: Record<string, string> = {
    electronics: "Elektronika",
    vehicles: "Transportas",
    transport: "Transportas",
    services: "Paslaugos",
    jobs: "Darbas",
    home: "Namai ir buitis",
    clothing: "Mada",
    real_estate: "Nekilnojamas turtas",
    tools: "Namai ir buitis",
    rental: "Kita",
    other: "Kita",
  };

  return (
    <div
      id={mode === "kpi" ? "business-cockpit-kpi" : "business-cockpit-overview"}
      data-business-cockpit-7={mode === "kpi" ? "kpi" : "full"}
      className={cn("space-y-4", className)}
    >
      {mode === "analytics" ? null : (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Pajamos"
          value={`${derived.revenue.toLocaleString("lt-LT")} €`}
          hint={`${derived.soldCount} parduoti`}
          trend={derived.revenue > 0 ? "up" : "flat"}
        />
        <StatCard
          label="Kontaktai / Leads"
          value={String(derived.contacts + buyerIntentCount)}
          hint={`${analytics.callClicks} skamb. · ${analytics.chatStarts} pokalb.`}
          trend={derived.contacts > 0 ? "up" : "flat"}
        />
        <StatCard
          label="Peržiūros"
          value={String(analytics.views)}
          hint={analytics.source === "server" ? "Gyvi duomenys" : "Lokalu"}
        />
        <StatCard
          label="Konversija"
          value={`${derived.conversion} %`}
          hint="Kontaktai / peržiūros"
          trend={derived.conversion >= 5 ? "up" : "flat"}
        />
        <StatCard
          label="Reklamos išlaidos"
          value={`${derived.adSpend.toLocaleString("lt-LT", {
            maximumFractionDigits: 2,
          })} €`}
          hint={
            analytics.costPerContact != null
              ? `${analytics.costPerContact.toLocaleString("lt-LT", {
                  minimumFractionDigits: 2,
                })} € / kontaktas`
              : "Promote spend"
          }
        />
        <StatCard
          label="AI sutaupytas laikas (įvertinimas)"
          value={`~${derived.aiMinutes} min`}
          hint={`Piniginė: ${walletBalance.toLocaleString("lt-LT")} €`}
          trend={derived.aiMinutes > 0 ? "up" : "flat"}
        />
      </div>
      )}

      {mode === "kpi" ? null : (
        <>
      <div
        id="business-analytics"
        data-section="analytics"
        className="grid gap-3 lg:grid-cols-2"
      >
        <Card variant="elevated">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="ds-label text-[var(--ds-text-muted)]">Rodikliai</p>
              <h3 className="font-[family-name:var(--font-outfit)] text-sm font-semibold text-[var(--ds-text-primary)]">
                Peržiūrų dinamika
              </h3>
            </div>
            <Badge tone="brand" className="gap-1">
              <Eye className="h-3 w-3" aria-hidden />
              {analytics.views}
            </Badge>
          </div>
          {derived.trendAvailable ? (
            <>
              <p className="mt-3 text-sm text-[var(--ds-text-primary)]">
                Dabartinis periodas: {analytics.views} peržiūrų.
              </p>
              <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
                Istorinių periodų duomenys dar neteikiami — dinamikos grafikas
                atsiras, kai bus sukaupta laiko eilutė.
              </p>
            </>
          ) : (
            <p
              className="mt-3 text-sm text-[var(--ds-text-muted)]"
              data-metric-unavailable="views"
            >
              Duomenų šiuo metu nėra arba jie neprieinami.
            </p>
          )}
        </Card>

        <Card variant="elevated">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="ds-label text-[var(--ds-text-muted)]">Rodikliai</p>
              <h3 className="font-[family-name:var(--font-outfit)] text-sm font-semibold text-[var(--ds-text-primary)]">
                Kontaktų dinamika
              </h3>
            </div>
            <Badge tone="success" className="gap-1">
              <MessageCircle className="h-3 w-3" aria-hidden />
              {derived.contacts}
            </Badge>
          </div>
          {derived.trendAvailable ? (
            <>
              <p className="mt-3 text-sm text-[var(--ds-text-primary)]">
                Dabartinis periodas: {derived.contacts} kontaktų.
              </p>
              <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
                Skambučiai + pokalbiai — konversijos rodiklio pagrindas.
              </p>
            </>
          ) : (
            <p
              className="mt-3 text-sm text-[var(--ds-text-muted)]"
              data-metric-unavailable="contacts"
            >
              Duomenų šiuo metu nėra arba jie neprieinami.
            </p>
          )}
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card variant="default">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[var(--ds-brand)]" aria-hidden />
            <h3 className="font-[family-name:var(--font-outfit)] text-sm font-semibold text-[var(--ds-text-primary)]">
              Skelbimų efektyvumas pagal kategoriją
            </h3>
          </div>
          {derived.categoryRows.length === 0 ? (
            <p className="text-sm text-[var(--ds-text-muted)]">
              Pridėkite skelbimų — pamatysite kategorijų palyginimą.
            </p>
          ) : (
            <ul className="space-y-2">
              {derived.categoryRows.map((row) => (
                <li
                  key={row.category}
                  className="rounded-[var(--ds-radius-control)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-muted)] px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-semibold text-[var(--ds-text-primary)]">
                      {categoryLabels[row.category] ?? row.category}
                    </span>
                    <span className="text-xs text-[var(--ds-text-muted)]">
                      {row.count} skelb. · {row.conv} %
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--ds-surface-card)]">
                    <div
                      className="h-full rounded-full bg-[var(--ds-brand)]"
                      style={{ width: `${Math.max(6, row.conv)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--ds-text-muted)]">
                    {row.views} peržiūr. · {row.contacts} kontaktai
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card variant="default">
          <div className="mb-3 flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-[var(--ds-ai-strong)]" aria-hidden />
            <h3 className="font-[family-name:var(--font-outfit)] text-sm font-semibold text-[var(--ds-text-primary)]">
              Kaina prieš rinkos medianą
            </h3>
          </div>
          {derived.priceRows.length === 0 ? (
            <p className="text-sm text-[var(--ds-text-muted)]">
              Nėra aktyvių skelbimų palyginimui.
            </p>
          ) : (
            <ul className="space-y-2">
              {derived.priceRows.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 rounded-[var(--ds-radius-control)] border border-[var(--ds-border-subtle)] px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--ds-text-primary)]">
                      {row.title}
                    </p>
                    <p className="text-xs text-[var(--ds-text-muted)]">
                      Jūsų: {formatPrice(row.price)}
                      {row.median != null
                        ? ` · Mediana: ${formatPrice(row.median)}`
                        : ""}
                    </p>
                  </div>
                  <Badge
                    tone={
                      row.verdict === "high"
                        ? "warning"
                        : row.verdict === "low"
                          ? "success"
                          : "neutral"
                    }
                  >
                    {row.verdict === "high"
                      ? "Virš rinkos"
                      : row.verdict === "low"
                        ? "Žemiau"
                        : "Rinkoje"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {derived.market.priceRange.min != null &&
          derived.market.priceRange.max != null ? (
            <p className="mt-3 text-xs text-[var(--ds-text-muted)]">
              Portfelio diapazonas:{" "}
              {formatPrice(derived.market.priceRange.min)}–
              {formatPrice(derived.market.priceRange.max)} ·{" "}
              {derived.market.totalCompetitors} konkurentų skelbimų
            </p>
          ) : null}
        </Card>
      </div>

      <div id="business-ai" data-section="ai">
        <AiInsightCard
          title="AI verslo padėjėjas"
          body={
            derived.tips.length > 0
              ? derived.tips.map((t) => `• ${t}`).join("\n")
              : "Šiuo metu nėra duomenų, kuriais remiantis galėtume pateikti rekomendacijas."
          }
          ctaLabel="Atidaryti AI rekomendacijas"
          onCta={onOpenAiTips}
          className="whitespace-pre-line"
        />
        <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--ds-text-muted)]">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          Rekomendacijos kildinamos tik iš jūsų realių skelbimų duomenų.
        </p>
      </div>
        </>
      )}
    </div>
  );
}
