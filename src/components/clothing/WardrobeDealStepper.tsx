"use client";

import Link from "next/link";
import { Check, Clock, Package, Shield, Truck } from "lucide-react";
import {
  expressClaimRemainingMs,
  formatExpressDeadline,
} from "@/lib/order-agent";
import type { WardrobeDealView } from "@/lib/wardrobe-deals";
import type { EscrowTransaction } from "@/lib/types";

const ACCENT = "#09b1a8";

const STEPS = [
  { id: "paid", label: "Saugus mokėjimas", icon: Shield },
  { id: "packed", label: "Supakuota", icon: Package },
  { id: "shipping", label: "Kurjeris veža", icon: Truck },
  { id: "delivered", label: "Pristatyta", icon: Check },
  { id: "express", label: "24h auto-escrow", icon: Clock },
] as const;

function stepIndex(status: EscrowTransaction["status"], express: boolean): number {
  switch (status) {
    case "offered":
    case "paying":
      return 0;
    case "paid":
      return 1;
    case "label_sent":
      return 2;
    case "shipped":
      return 3;
    case "delivered":
      return express ? 4 : 3;
    default:
      return 0;
  }
}

function DealStepperCard({ deal }: { deal: WardrobeDealView }) {
  const active = stepIndex(deal.escrow.status, Boolean(deal.escrow.expressEscrow24h));
  const remaining =
    deal.escrow.expressEscrow24h && deal.escrow.status === "delivered"
      ? expressClaimRemainingMs(deal.escrow)
      : 0;

  return (
    <article className="rounded-2xl border border-[#e8e4df] bg-[#fffdf9] p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[#9ca3af]">
            {deal.role === "seller" ? "Pardavimas" : "Pirkimas"} · AI prižiūri
          </p>
          <p className="mt-0.5 text-sm font-light text-[#374151]">{deal.listingTitle}</p>
        </div>
        <Link
          href={`/chats/${deal.chatId}/`}
          className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium text-white"
          style={{ backgroundColor: ACCENT }}
        >
          Pokalbis
        </Link>
      </div>

      <ol className="flex items-center justify-between gap-1">
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const done = idx < active;
          const current = idx === active;
          return (
            <li key={step.id} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full border transition ${
                  done || current
                    ? "border-[var(--chameleon-accent,#09b1a8)] bg-[color-mix(in_srgb,var(--chameleon-accent,#09b1a8)_12%,var(--vauto-card-bg))] text-[var(--chameleon-accent,#09b1a8)]"
                    : "border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] text-[var(--vauto-text-muted)]"
                }`}
                aria-current={current ? "step" : undefined}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span
                className={`hidden text-center text-[9px] leading-tight sm:block ${
                  current
                    ? "font-medium text-[var(--chameleon-accent,#09b1a8)]"
                    : "font-light text-[var(--vauto-text-muted)]"
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {remaining > 0 && (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-[color-mix(in_srgb,var(--vauto-accent)_12%,var(--vauto-card-bg))] px-3 py-2 text-xs text-[var(--vauto-text-main)]">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          24h auto-escrow iki {formatExpressDeadline(deal.escrow)} — pinigai saugiai laikomi.
        </p>
      )}

      {deal.escrow.trackingCode && (
        <p className="mt-2 text-[10px] font-light text-[var(--vauto-text-muted)]">
          Sekimo kodas:{" "}
          <span className="font-medium text-[var(--vauto-text-main)]">{deal.escrow.trackingCode}</span>
        </p>
      )}
    </article>
  );
}

export function WardrobeDealStepper({ deals }: { deals: WardrobeDealView[] }) {
  if (deals.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-light tracking-wide text-[#374151]">
        Tavo sandoriai
      </h2>
      <p className="mb-3 text-xs font-light text-[#9ca3af]">
        Aiški būsena — supakuota, keliauja arba aktyvuotas 24h auto-escrow.
      </p>
      <div className="space-y-3">
        {deals.slice(0, 4).map((deal) => (
          <DealStepperCard key={deal.chatId} deal={deal} />
        ))}
      </div>
    </section>
  );
}
