"use client";

import { Award, LockKeyhole, MessageCircle, Zap } from "lucide-react";
import {
  coverageTier,
  isTopRatedPlus,
  leadPriceForCoverage,
  serviceLeadMatchesProvider,
  urgencyLabel,
} from "@/lib/service-leads";
import { useVauto } from "@/context/VautoContext";
import type { UserProfile } from "@/lib/types";

interface ServiceLeadInboxProps {
  balance: number;
  user: UserProfile;
  rating: number;
}

export function ServiceLeadInbox({ balance, user, rating }: ServiceLeadInboxProps) {
  const { serviceLeads, openedServiceLeadIds, openServiceLead, showToast } = useVauto();

  const topRatedPlus = isTopRatedPlus({
    rating,
    averageResponseMinutes: user.averageResponseMinutes,
  });
  const tier = coverageTier(user.serviceRadiusKm, user.serviceNationwide);
  const leads = serviceLeads.filter((lead) => serviceLeadMatchesProvider(lead, user));

  const handleOpen = (leadId: string, price: number) => {
    const ok = openServiceLead(leadId, price);
    if (ok) {
      showToast(`Kontaktas atidarytas (−${price.toFixed(2)} €)`, "success");
      return;
    }
    showToast("Nepakanka balanso — papildykite piniginę.", "info");
  };

  return (
    <section className="vauto-dashboard-card mb-4 rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
            Paslaugų lead’ai
          </p>
          <h2 className="text-base font-bold text-[var(--vauto-text-heading)]">
            Užsakymai tavo rajone
          </h2>
          <p className="mt-1 text-xs text-[var(--vauto-text-muted)]">
            {user.serviceNationwide
              ? "Visa Lietuva"
              : `${user.serviceBaseCity ?? "Vilnius"} · ${user.serviceRadiusKm ?? 25} km`}{" "}
            · {tier === "national" ? "Premium tarifas" : tier === "regional" ? "Regioninis tarifas" : "Vietinis tarifas"}
          </p>
        </div>
        <Zap className="h-5 w-5 text-[var(--ds-ai)]" />
      </div>

      {topRatedPlus && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
          <Award className="h-4 w-4" />
          Top Rated Plus · {rating.toFixed(1)} ★ · atsako per {user.averageResponseMinutes ?? 12} min · -15% lead’ams
        </div>
      )}

      <div className="space-y-3">
        {leads.map((lead) => {
          const opened = openedServiceLeadIds.has(lead.id);
          const leadPrice = leadPriceForCoverage(lead.leadPrice, {
            radiusKm: user.serviceRadiusKm,
            nationwide: user.serviceNationwide,
            topRatedPlus,
          });
          const canOpen = balance >= leadPrice || opened;
          const contact = opened
            ? lead.contactPhone ?? "+370 612 44550"
            : lead.hiddenContact;

          return (
            <article
              key={lead.id}
              className="rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-surface-muted)] p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--vauto-text-heading)]">{lead.title}</p>
                    {lead.source === "buyer" && (
                      <span className="rounded-full bg-[var(--vauto-teal)]/20 px-2 py-0.5 text-[9px] font-bold uppercase text-[var(--vauto-teal)]">
                        Live
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[var(--vauto-text-muted)]">
                    {lead.category} · {lead.city} · {urgencyLabel(lead.urgency)}
                  </p>
                </div>
                <span className="rounded-full bg-[var(--ds-brand-soft)] px-2 py-1 text-[10px] font-bold text-[var(--ds-brand)]">
                  {leadPrice.toFixed(2)} €
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--vauto-text-muted)]">
                {lead.summary}
              </p>
              <p className="mt-2 text-xs text-[var(--vauto-text-muted)]">
                Biudžetas: {lead.budgetHint} · Kontaktas:{" "}
                <span className="font-mono">{contact}</span>
              </p>
              <button
                type="button"
                disabled={!canOpen && !opened}
                onClick={() => handleOpen(lead.id, leadPrice)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[var(--vauto-teal)] px-3 py-2 text-xs font-semibold text-white disabled:bg-[var(--vauto-border)] disabled:text-[var(--vauto-text-muted)]"
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
        {leads.length === 0 && (
          <p className="rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-surface-muted)] p-3 text-sm text-[var(--vauto-text-muted)]">
            Šiuo metu nėra lead’ų, atitinkančių jūsų miestą ir specializacijas.
          </p>
        )}
      </div>
    </section>
  );
}
