"use client";

import { LockKeyhole, MessageCircle, Zap } from "lucide-react";
import { useState } from "react";
import { DEMO_SERVICE_LEADS, urgencyLabel } from "@/lib/service-leads";

interface ServiceLeadInboxProps {
  balance: number;
}

export function ServiceLeadInbox({ balance }: ServiceLeadInboxProps) {
  const [openedIds, setOpenedIds] = useState<Set<string>>(new Set());

  return (
    <section className="vauto-dashboard-card mb-4 rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Paslaugų lead’ai
          </p>
          <h2 className="text-base font-bold text-white">
            Užsakymai tavo rajone
          </h2>
        </div>
        <Zap className="h-5 w-5 text-[var(--vauto-orange)]" />
      </div>

      <div className="space-y-3">
        {DEMO_SERVICE_LEADS.map((lead) => {
          const opened = openedIds.has(lead.id);
          const canOpen = balance >= lead.leadPrice || opened;
          return (
            <article
              key={lead.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">{lead.title}</p>
                  <p className="text-[10px] text-slate-500">
                    {lead.category} · {lead.city} · {urgencyLabel(lead.urgency)}
                  </p>
                </div>
                <span className="rounded-full bg-[var(--vauto-orange)]/15 px-2 py-1 text-[10px] font-bold text-[var(--vauto-orange)]">
                  {lead.leadPrice.toFixed(2)} €
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                {lead.summary}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Biudžetas: {lead.budgetHint} · Kontaktas:{" "}
                <span className="font-mono">
                  {opened ? "+370 612 44550" : lead.hiddenContact}
                </span>
              </p>
              <button
                type="button"
                disabled={!canOpen}
                onClick={() => setOpenedIds((prev) => new Set([...prev, lead.id]))}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[var(--vauto-teal)] px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-700 disabled:text-slate-400"
              >
                {opened ? (
                  <MessageCircle className="h-3.5 w-3.5" />
                ) : (
                  <LockKeyhole className="h-3.5 w-3.5" />
                )}
                {opened
                  ? "Kontaktas atidarytas"
                  : canOpen
                    ? "Atidaryti kontaktą"
                    : "Papildykite balansą"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
