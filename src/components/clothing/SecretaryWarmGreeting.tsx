"use client";

import { Sparkles } from "lucide-react";
import { getFirstName } from "@/lib/buddy-voice";
import {
  countActiveShipments,
  countExpressEscrowTimers,
  type WardrobeDealView,
} from "@/lib/wardrobe-deals";
import type { Listing } from "@/lib/types";

const ACCENT = "#09b1a8";

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
  const message = isGuest
    ? "Labas! Aš esu tavo AI mados asistentas. Čia gali pirkti ir parduoti drabužius be ilgų Vinted laukimų. Išbandyk spintos importą viršuje!"
    : buildSummary(getFirstName(userName || "Drauge"), listings, deals);

  return (
    <div
      className="mb-5 overflow-hidden rounded-3xl border bg-gradient-to-br from-[#fffdf9] to-[#e6f7f6] p-4 shadow-sm"
      style={{ borderColor: "#b8ebe8" }}
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
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: ACCENT }}>
            Tavo AI sekretorė
          </p>
          <p className="mt-1 text-sm font-light leading-relaxed text-[#374151]">{message}</p>
        </div>
      </div>
    </div>
  );
}
