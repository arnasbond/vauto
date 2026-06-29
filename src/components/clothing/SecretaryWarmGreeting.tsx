"use client";

import { Sparkles } from "lucide-react";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { getFirstName } from "@/lib/buddy-voice";
import {
  countActiveShipments,
  countExpressEscrowTimers,
  type WardrobeDealView,
} from "@/lib/wardrobe-deals";
import type { Listing } from "@/lib/types";

const ACCENT = "#09b1a8";

export const WARDROBE_SECRETARY_CLICK_GREETING =
  "Labas! Aš esu tavo AI asistentas. Galiu padėti sinchronizuoti skelbimus iš kelių portalų, derėtis su pirkėjais fone ir valdyti užklausas. Ką išbandome pirmiausia?";

function buildSummary(
  firstName: string,
  listings: Listing[],
  deals: WardrobeDealView[]
): string {
  const active = listings.filter((l) => l.category === "clothing" && l.status !== "sold");
  const shipments = countActiveShipments(deals);
  const express = countExpressEscrowTimers(deals);

  if (active.length === 0 && deals.length === 0) {
    return `${firstName}, tavo spinta laukia pirmos prekės — padėsiu viską supakuoti ir saugiai išsiųsti.`;
  }

  const parts: string[] = [];
  if (active.length > 0) {
    parts.push(
      active.length === 1
        ? "1 prekė spintoje laukia pirkėjos"
        : `${active.length} prekės spintoje laukia pirkėjų`
    );
  }
  if (shipments > 0) {
    parts.push(
      shipments === 1 ? "1 siunta jau keliauja" : `${shipments} siuntos jau keliauja`
    );
  }
  if (express > 0) {
    parts.push(
      express === 1
        ? "aktyvus 24h auto-escrow laikmatis"
        : `${express} aktyvūs 24h auto-escrow laikmačiai`
    );
  }

  return `${firstName}, ${parts.join(" · ")} — viską stebiu ir informuosiu, jei reikės tavo žingsnio.`;
}

export function SecretaryWarmGreeting({
  userName,
  listings,
  deals,
  isGuest = false,
}: {
  userName?: string;
  listings: Listing[];
  deals: WardrobeDealView[];
  isGuest?: boolean;
}) {
  const { openWithGreeting } = useVautoAgent();

  const message = isGuest
    ? "Paspausk čia — pradėsiu pokalbį balsu ir padėsiu su spinta, derybomis ar stiliaus patarimais."
    : buildSummary(getFirstName(userName || "Drauge"), listings, deals);

  const handleActivate = () => {
    openWithGreeting(WARDROBE_SECRETARY_CLICK_GREETING);
  };

  return (
    <button
      type="button"
      onClick={handleActivate}
      className="mb-5 w-full overflow-hidden rounded-3xl border border-slate-700 bg-[#1e293b] p-4 text-left text-white shadow-lg shadow-black/20 transition hover:brightness-105 active:scale-[0.995] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1128]"
      aria-label="Atidaryti AI asistento pokalbį"
    >
      <div className="flex gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm"
          style={{ backgroundColor: ACCENT }}
          aria-hidden
        >
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-white">
            Tavo AI sekretorė
          </p>
          <p className="mt-1 text-sm font-light leading-relaxed text-slate-200">{message}</p>
        </div>
      </div>
    </button>
  );
}
