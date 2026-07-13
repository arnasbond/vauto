"use client";

import { Barcode, Camera, PenLine, Shield, Sparkles, Zap } from "lucide-react";

const FEATURES = [
  {
    icon: Camera,
    title: "AI iš nuotraukų",
    text: "Įkelkite nuotraukas — DI atpažins prekę, kainą ir paruoš profesionalų aprašymą.",
  },
  {
    icon: Barcode,
    title: "Brūkšninis kodas",
    text: "Nuskenuokite etiketę — automatiškai užpildysime prekės ženklą ir parametrus.",
  },
  {
    icon: PenLine,
    title: "Rankinis režimas",
    text: "Kalbėkite su asistentu natūralia kalba — jis užduos tik reikalingus klausimus.",
  },
] as const;

/**
 * Desktop-only companion column for /add — explains value without stretching mobile UI.
 */
export function DesktopAddAside({ fashionMode }: { fashionMode?: boolean }) {
  return (
    <aside className="hidden md:block" aria-label="Skelbimo įkėlimo privalumai">
      <div className="sticky top-[calc(var(--anonser-header-height)+1.5rem)] space-y-5">
        <section className="overflow-hidden rounded-2xl border border-[var(--anonser-border)] bg-[var(--anonser-card)] shadow-sm">
          <div className="border-b border-[var(--anonser-border)] bg-gradient-to-br from-[var(--anonser-primary-soft)] to-white px-5 py-5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--anonser-primary)]">
              <Sparkles className="h-3.5 w-3.5" />
              VAUTO AI
            </span>
            <h2 className="mt-3 font-display text-xl font-bold tracking-tight text-[var(--anonser-text)]">
              {fashionMode ? "Asortimento įkėlimas" : "Naujas skelbimas"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--anonser-text-muted)]">
              {fashionMode
                ? "Profesionali spinta su DI — greičiau nei bet kuriame portale."
                : "Universali skelbimų platforma: transportas, NT, technika, paslaugos ir darbas."}
            </p>
          </div>
          <ul className="divide-y divide-[var(--anonser-border)]">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3 px-5 py-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--anonser-primary-soft)] text-[var(--anonser-primary)]">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--anonser-text)]">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-[var(--anonser-text-muted)]">
                    {text}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex items-start gap-3 rounded-2xl border border-[var(--anonser-border)] bg-[var(--anonser-surface-muted)]/60 p-4">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[var(--anonser-accent)]" />
          <div>
            <p className="text-xs font-semibold text-[var(--anonser-text)]">Saugus publikavimas</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--anonser-text-muted)]">
              Peržiūrite juodraštį prieš skelbimą — jokių netikėtų publikacijų.
            </p>
          </div>
        </section>

        <section className="flex items-center gap-2 rounded-xl bg-[var(--anonser-primary)]/5 px-4 py-3 text-xs text-[var(--anonser-primary)]">
          <Zap className="h-4 w-4 shrink-0" />
          <span>Gemini Flash — VAUTO serveris analizuoja nuotraukas realiu laiku.</span>
        </section>
      </div>
    </aside>
  );
}
