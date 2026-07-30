"use client";

import {
  ArrowDownRight,
  Megaphone,
  Phone,
  Share2,
  Target,
  TrendingUp,
  Eye,
} from "lucide-react";
import type { SellerListingAnalytics } from "@/lib/seller-listing-analytics";

interface B2BAnalyticsPanelProps {
  analytics: SellerListingAnalytics;
}

function pct(part: number, whole: number): string {
  if (!(whole > 0) || !(part >= 0)) return "—";
  return `${Math.min(100, Math.round((part / whole) * 100))}%`;
}

/**
 * Pro B2B ROI (spend vs contacts) + 9:16 Social Engine reach funnel.
 */
export function B2BAnalyticsPanel({ analytics }: B2BAnalyticsPanelProps) {
  const {
    views,
    shareStory,
    contacts,
    callClicks,
    chatStarts,
    promoteSpendEur,
    costPerContact,
    source,
  } = analytics;

  const funnelMax = Math.max(views, shareStory, contacts, 1);
  const viewW = Math.max(8, Math.round((views / funnelMax) * 100));
  const shareW = Math.max(8, Math.round((shareStory / funnelMax) * 100));
  const contactW = Math.max(8, Math.round((contacts / funnelMax) * 100));

  return (
    <section className="vauto-dashboard-card mb-4 rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
            B2B analitika
          </p>
          <h3 className="text-sm font-bold text-[var(--vauto-text)]">
            ROI ir 9:16 pasiekiamumas
          </h3>
        </div>
        <span className="rounded-full bg-[var(--vauto-surface-page)] px-2 py-0.5 text-[10px] text-[var(--vauto-muted)]">
          {source === "server" ? "Gyvi duomenys" : "Lokalu"}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl bg-[var(--vauto-surface-page)] p-2.5">
          <p className="flex items-center gap-1 text-[10px] text-[var(--vauto-muted)]">
            <Megaphone className="h-3 w-3" />
            Išleista
          </p>
          <p className="mt-0.5 text-lg font-bold text-[var(--vauto-text)]">
            {promoteSpendEur.toLocaleString("lt-LT", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}{" "}
            €
          </p>
          <p className="text-[9px] text-[var(--vauto-muted)]">Promote spend</p>
        </div>
        <div className="rounded-xl bg-[var(--vauto-surface-page)] p-2.5">
          <p className="flex items-center gap-1 text-[10px] text-[var(--vauto-muted)]">
            <Phone className="h-3 w-3" />
            Kontaktai
          </p>
          <p className="mt-0.5 text-lg font-bold text-[var(--vauto-text)]">
            {contacts}
          </p>
          <p className="text-[9px] text-[var(--vauto-muted)]">
            {callClicks} skamb. · {chatStarts} pokalb.
          </p>
        </div>
        <div className="rounded-xl bg-[var(--vauto-teal)]/10 p-2.5">
          <p className="flex items-center gap-1 text-[10px] text-[var(--vauto-teal)]">
            <Target className="h-3 w-3" />
            Kaina / kontaktas
          </p>
          <p className="mt-0.5 text-lg font-bold text-[var(--vauto-teal)]">
            {costPerContact != null
              ? `${costPerContact.toLocaleString("lt-LT", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} €`
              : "—"}
          </p>
          <p className="text-[9px] text-[var(--vauto-muted)]">Spend ÷ contacts</p>
        </div>
        <div className="rounded-xl bg-[var(--vauto-surface-page)] p-2.5">
          <p className="flex items-center gap-1 text-[10px] text-[var(--vauto-muted)]">
            <TrendingUp className="h-3 w-3" />
            Konversija
          </p>
          <p className="mt-0.5 text-lg font-bold text-[var(--vauto-text)]">
            {pct(contacts, views)}
          </p>
          <p className="text-[9px] text-[var(--vauto-muted)]">Kontaktai / peržiūros</p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--vauto-border)] p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <Share2 className="h-3.5 w-3.5 text-[var(--vauto-teal)]" />
          <p className="text-xs font-semibold text-[var(--vauto-text)]">
            Social Engine · 9:16 piltuvėlis
          </p>
        </div>
        <div className="space-y-2.5">
          <FunnelRow
            icon={Eye}
            label="Peržiūros"
            value={views}
            widthPct={viewW}
            note="Skelbimo atidarymai"
          />
          <div className="flex justify-center text-[var(--vauto-muted)]">
            <ArrowDownRight className="h-3.5 w-3.5" />
          </div>
          <FunnelRow
            icon={Share2}
            label="9:16 dalijimaisi"
            value={shareStory}
            widthPct={shareW}
            note={`${pct(shareStory, views)} nuo peržiūrų`}
            accent
          />
          <div className="flex justify-center text-[var(--vauto-muted)]">
            <ArrowDownRight className="h-3.5 w-3.5" />
          </div>
          <FunnelRow
            icon={Phone}
            label="Kontaktai"
            value={contacts}
            widthPct={contactW}
            note={`${pct(contacts, shareStory > 0 ? shareStory : views)} po Stories`}
          />
        </div>
      </div>
    </section>
  );
}

function FunnelRow({
  icon: Icon,
  label,
  value,
  widthPct,
  note,
  accent,
}: {
  icon: typeof Eye;
  label: string;
  value: number;
  widthPct: number;
  note: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--vauto-text)]">
          <Icon
            className={`h-3.5 w-3.5 ${
              accent ? "text-[var(--vauto-teal)]" : "text-[var(--vauto-muted)]"
            }`}
          />
          {label}
        </p>
        <p className="text-sm font-bold text-[var(--vauto-text)]">{value}</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--vauto-surface-page)]">
        <div
          className={`h-full rounded-full transition-all ${
            accent ? "bg-[var(--vauto-teal)]" : "bg-sky-400/80"
          }`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <p className="mt-0.5 text-[9px] text-[var(--vauto-muted)]">{note}</p>
    </div>
  );
}
