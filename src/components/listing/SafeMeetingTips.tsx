"use client";

import { MapPin, Shield } from "lucide-react";

const MEETING_TIPS = [
  "Susitikite viešoje vietoje — prekybos centro parkavimas ar kavinė.",
  "Apžiūrėkite prekę dienos šviesoje, ne vakare.",
  "Neskubėkite mokėti iš anksto — pirmiau pamatykite gyvai.",
  "Rinkitės viešas vietas savo mieste: prekybos centrų, IKI ar Maxima parkavimus.",
];

export function SafeMeetingTips() {
  return (
    <section className="vauto-glass-card mt-4 rounded-2xl p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
        <Shield className="h-4 w-4 text-[var(--flux-teal)]" />
        Saugus susitikimas
      </h2>
      <ul className="mt-2 space-y-2">
        {MEETING_TIPS.map((tip) => (
          <li
            key={tip}
            className="flex gap-2 text-xs leading-relaxed text-[var(--vauto-text-muted)]"
          >
            <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-[var(--flux-teal)]" />
            {tip}
          </li>
        ))}
      </ul>
    </section>
  );
}
