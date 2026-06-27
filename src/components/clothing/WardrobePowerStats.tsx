"use client";

import { BarChart3, Crown } from "lucide-react";
import { useMemo } from "react";
import { useVauto } from "@/context/VautoContext";
import { getListingMetrics } from "@/lib/listing-analytics";
import { buildWardrobePowerSubscriptionCheckout } from "@/lib/monetization-wardrobe";
import { resolveWardrobeSubscriptionAccess } from "@/lib/SubscriptionGuard";
import type { Listing, UserProfile } from "@/lib/types";

const ACCENT = "#09b1a8";

interface WardrobePowerStatsProps {
  user: UserProfile;
  listings: Listing[];
  inSpintaCabinet?: boolean;
}

export function WardrobePowerStats({
  user,
  listings,
  inSpintaCabinet = false,
}: WardrobePowerStatsProps) {
  const { chameleonTheme, openCheckout } = useVauto();
  const access = resolveWardrobeSubscriptionAccess(user, chameleonTheme, inSpintaCabinet);

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

  if (!access.showsDeepStats) {
    return (
      <div className="mb-6 rounded-3xl border border-dashed border-[#b8ebe8] bg-[#fffdf9] p-4">
        <div className="flex items-start gap-3">
          <Crown className="h-5 w-5 shrink-0 text-[#09b1a8]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-light text-[#374151]">Power-User statistika</p>
            <p className="mt-1 text-xs font-light text-[#9ca3af]">
              Gilesnė analitika ir neribotas spintos importas —{" "}
              {access.importsRemaining === 0
                ? "nemokamas importas išnaudotas"
                : `liko ${access.importsRemaining} nemokamas importas`}
            </p>
            <button
              type="button"
              onClick={() => openCheckout(buildWardrobePowerSubscriptionCheckout())}
              className="mt-3 rounded-full px-4 py-2 text-xs font-medium text-white"
              style={{ backgroundColor: ACCENT }}
            >
              Tapti Power-User · 4,99 € / mėn.
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="mb-6 rounded-3xl border border-[#b8ebe8] bg-[#fffdf9] p-4">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4" style={{ color: ACCENT }} />
        <p className="text-sm font-light text-[#374151]">Spintos analitika · Power-User</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatChip label="Peržiūros" value={String(stats.views)} />
        <StatChip label="Išsaugota" value={String(stats.saves)} />
        <StatChip label="Pokalbiai" value={String(stats.chats)} />
        <StatChip label="Domėjimasis" value={`${stats.conversion}%`} />
      </div>
      <p className="mt-2 text-[10px] font-light text-[#9ca3af]">
        {stats.count} prek{stats.count === 1 ? "ė" : "ės"} spintoje · neribotas importas aktyvus
      </p>
    </section>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e8e4df] bg-white px-3 py-2.5 text-center">
      <p className="text-lg font-medium text-[#374151]">{value}</p>
      <p className="text-[10px] font-light uppercase tracking-wide text-[#9ca3af]">
        {label}
      </p>
    </div>
  );
}
