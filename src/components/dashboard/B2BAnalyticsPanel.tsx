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
import { Badge, Card } from "@/design-system";
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
    <Card variant="elevated" className="mb-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="ds-label text-[var(--ds-text-muted)]">B2B analitika</p>
          <h3 className="font-[family-name:var(--font-outfit)] text-sm font-bold text-[var(--ds-text-primary)]">
            ROI ir 9:16 pasiekiamumas
          </h3>
        </div>
        <Badge tone={source === "server" ? "success" : "neutral"}>
          {source === "server" ? "Gyvi duomenys" : "Lokalu"}
        </Badge>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-[var(--ds-radius-control)] bg-[var(--ds-surface-muted)] p-2.5">
          <p className="flex items-center gap-1 text-[10px] text-[var(--ds-text-muted)]">
            <Megaphone className="h-3 w-3" />
            Išleista
          </p>
          <p className="mt-0.5 text-lg font-bold text-[var(--ds-text-primary)]">
            {promoteSpendEur.toLocaleString("lt-LT", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}{" "}
            €
          </p>
          <p className="text-[9px] text-[var(--ds-text-muted)]">Promote spend</p>
        </div>
        <div className="rounded-[var(--ds-radius-control)] bg-[var(--ds-surface-muted)] p-2.5">
          <p className="flex items-center gap-1 text-[10px] text-[var(--ds-text-muted)]">
            <Phone className="h-3 w-3" />
            Kontaktai
          </p>
          <p className="mt-0.5 text-lg font-bold text-[var(--ds-text-primary)]">
            {contacts}
          </p>
          <p className="text-[9px] text-[var(--ds-text-muted)]">
            {callClicks} skamb. · {chatStarts} pokalb.
          </p>
        </div>
        <div className="rounded-[var(--ds-radius-control)] bg-[var(--ds-ai-soft)] p-2.5">
          <p className="flex items-center gap-1 text-[10px] text-[var(--ds-ai-strong)]">
            <Target className="h-3 w-3" />
            Kaina / kontaktas
          </p>
          <p className="mt-0.5 text-lg font-bold text-[var(--ds-ai-strong)]">
            {costPerContact != null
              ? `${costPerContact.toLocaleString("lt-LT", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} €`
              : "—"}
          </p>
          <p className="text-[9px] text-[var(--ds-text-muted)]">Spend ÷ contacts</p>
        </div>
        <div className="rounded-[var(--ds-radius-control)] bg-[var(--ds-surface-muted)] p-2.5">
          <p className="flex items-center gap-1 text-[10px] text-[var(--ds-text-muted)]">
            <TrendingUp className="h-3 w-3" />
            Konversija
          </p>
          <p className="mt-0.5 text-lg font-bold text-[var(--ds-text-primary)]">
            {pct(contacts, views)}
          </p>
          <p className="text-[9px] text-[var(--ds-text-muted)]">
            Kontaktai / peržiūros
          </p>
        </div>
      </div>

      <div className="rounded-[var(--ds-radius-control)] border border-[var(--ds-border-subtle)] p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <Share2 className="h-3.5 w-3.5 text-[var(--ds-ai-strong)]" />
          <p className="text-xs font-semibold text-[var(--ds-text-primary)]">
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
          <div className="flex justify-center text-[var(--ds-text-muted)]">
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
          <div className="flex justify-center text-[var(--ds-text-muted)]">
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
    </Card>
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
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--ds-text-primary)]">
          <Icon
            className={`h-3.5 w-3.5 ${
              accent ? "text-[var(--ds-ai-strong)]" : "text-[var(--ds-text-muted)]"
            }`}
          />
          {label}
        </p>
        <p className="text-sm font-bold text-[var(--ds-text-primary)]">{value}</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--ds-surface-muted)]">
        <div
          className={`h-full rounded-full transition-all ${
            accent ? "bg-[var(--ds-ai)]" : "bg-[var(--ds-brand)]"
          }`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <p className="mt-0.5 text-[9px] text-[var(--ds-text-muted)]">{note}</p>
    </div>
  );
}
