"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { CV_PERIODS, EXPERIENCE_AREAS, JOB_CITIES } from "@/lib/job-catalog";
import { usePortalSearchSubmit } from "@/hooks/usePortalSearchSubmit";

const ACCENT = "#1f4b99";

export function JobSearchPanel() {
  const { searchQuery } = useVauto();
  const { submitSearch, busy } = usePortalSearchSubmit();
  const [keyword, setKeyword] = useState(searchQuery);
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [period, setPeriod] = useState("Visi CV");
  const [showMore, setShowMore] = useState(false);

  const runSearch = () => {
    const parts = [keyword.trim(), city, area].filter(Boolean);
    void submitSearch(parts.join(" ").trim() || "darbas");
  };

  return (
    <div className="mb-6 rounded-xl border border-[#d9e2f1] bg-white p-4 shadow-sm">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#1f4b99]">
        Nr.1 lankomiausias darbo portalas
      </p>
      <h3 className="mb-4 text-lg font-bold text-[#172033]">Darbuotojų duomenų bazė</h3>

      <label className="mb-1 block text-sm text-[#475569]">
        Raktinis žodis <span className="text-xs text-[#94a3b8]">(raktažodžius atskirkite tarpu)</span>
      </label>
      <input
        type="text"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="pvz. IT inžinierius"
        className="mb-3 w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm outline-none focus:border-[#1f4b99]"
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm text-[#475569]">Miestas</label>
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
          >
            <option value="">Visi</option>
            {JOB_CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-[#475569]">Patirties sritis</label>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
          >
            <option value="">Visos</option>
            {EXPERIENCE_AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowMore((s) => !s)}
        className="mb-3 text-sm font-medium text-[#1f4b99] hover:underline"
      >
        {showMore ? "▲ Mažiau kriterijų" : "▼ Daugiau kriterijų"}
      </button>

      {showMore && (
        <div className="mb-3">
          <label className="mb-1 block text-sm text-[#475569]">Laikotarpis</label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
          >
            {CV_PERIODS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="rounded-lg bg-[#eaf1ff] p-3">
        <button
          type="button"
          onClick={runSearch}
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded py-3 text-base font-semibold text-white disabled:opacity-70"
          style={{ backgroundColor: ACCENT }}
        >
          {busy ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Ieškoma…
            </>
          ) : (
            "ieškoti"
          )}
        </button>
      </div>
    </div>
  );
}
