"use client";

import { BarChart3 } from "lucide-react";
import { useMemo } from "react";
import { useVauto } from "@/context/VautoContext";
import { getListingMetrics } from "@/lib/listing-analytics";
import { resolveWardrobeSubscriptionAccess } from "@/lib/SubscriptionGuard";
import type { Listing, UserProfile } from "@/lib/types";

const CARD_CLASS =
  "mb-6 rounded-3xl border border-border bg-card p-4 text-foreground";

interface WardrobePowerStatsProps {
  user: UserProfile;
  listings: Listing[];
  inSpintaCabinet?: boolean;
}

/** Spinta cabinet analytics — no Power-User paywall (deprecated). */
export function WardrobePowerStats({
  user,
  listings,
  inSpintaCabinet = false,
}: WardrobePowerStatsProps) {
  const { chameleonTheme } = useVauto();
  const access = resolveWardrobeSubscriptionAccess(
    user,
    chameleonTheme,
    inSpintaCabinet
  );

  const stats = useMemo(() => {
    const clothing = listings.filter((l) => l.category === "clothing");
    let views = 0;
    let saves = 0;
    let chats = 0;
    for (const l of clothing) {
      const m = getListingMetrics(l);
      views += m.views;
      saves += m.saves;
      chats += m.chatStarts;
    }
    const conversion =
      views > 0 ? Math.round(((saves + chats) / views) * 100) : 0;
    return { views, saves, chats, conversion, count: clothing.length };
  }, [listings]);

  if (!access.active) return null;

  return (
    <section className={CARD_CLASS}>
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Spintos analitika</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatChip label="Peržiūros" value={String(stats.views)} />
        <StatChip label="Išsaugota" value={String(stats.saves)} />
        <StatChip label="Pokalbiai" value={String(stats.chats)} />
        <StatChip label="Domėjimasis" value={`${stats.conversion}%`} />
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        {stats.count} prek{stats.count === 1 ? "ė" : "ės"} spintoje
      </p>
    </section>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-accent px-3 py-2.5 text-center">
      <p className="text-lg font-semibold text-foreground">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
