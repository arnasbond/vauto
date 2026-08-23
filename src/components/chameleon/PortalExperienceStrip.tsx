"use client";

import { useVauto } from "@/context/VautoContext";
import {
  allVerticalExperiences,
  verticalExperienceForQuery,
  verticalShortLabel,
} from "@/lib/vertical-presentation";

export function VerticalExperienceStrip() {
  const { searchQuery, setSearchQuery } = useVauto();
  const active = verticalExperienceForQuery(searchQuery);
  const verticals = allVerticalExperiences();

  return (
    <section
      className="mb-5 rounded-2xl border p-4 shadow-sm transition-colors"
      style={{ background: active.bg, borderColor: active.border }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className="text-[11px] font-bold uppercase tracking-[0.18em]"
            style={{ color: active.color }}
          >
            {active.verticalName}
          </p>
          <h2 className="mt-1 text-lg font-extrabold text-[#111827]">
            {active.headline}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-[#4b5563]">
            {active.description}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-3 py-1 text-[10px] font-bold text-white"
          style={{ background: active.color }}
        >
          {active.vertical === "marketplace" ? "VAUTO" : "Kategorija"}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {active.quickFilters.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setSearchQuery(filter)}
            className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-[#374151] shadow-sm"
          >
            {filter}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {verticals.map((vertical) => (
          <button
            key={vertical.vertical}
            type="button"
            onClick={() => setSearchQuery(vertical.quickFilters[0])}
            className="rounded-xl bg-white/75 px-2 py-2 text-[10px] font-bold leading-tight shadow-sm"
            style={{
              color: vertical.color,
              outline:
                vertical.vertical === active.vertical
                  ? `2px solid ${vertical.color}`
                  : "1px solid rgba(255,255,255,0.6)",
            }}
          >
            {verticalShortLabel(vertical.vertical)}
          </button>
        ))}
      </div>
    </section>
  );
}
