"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import {
  SERVICE_CITIES,
  SERVICE_SPECIALTIES,
  SERVICE_URGENCY_OPTIONS,
} from "@/lib/service-catalog";
import { usePortalSearchSubmit } from "@/hooks/usePortalSearchSubmit";

export function ServiceSearchPanel() {
  const { searchQuery } = useVauto();
  const { submitSearch, busy } = usePortalSearchSubmit();
  const ui = getPortalUi("paslaugos");
  const [keyword, setKeyword] = useState(searchQuery);
  const [specialty, setSpecialty] = useState("");
  const [city, setCity] = useState("");
  const [urgency, setUrgency] = useState("");

  const runSearch = () => {
    const parts = [
      keyword.trim() || (specialty ? `reikia ${specialty.toLowerCase()}` : "reikia meistro"),
      specialty,
      city,
      urgency,
    ].filter(Boolean);
    void submitSearch(parts.join(" ").trim());
  };

  return (
    <div
      className="mb-6 rounded-2xl border bg-white p-4 shadow-sm"
      style={{ borderColor: ui.border }}
    >
      <h3 className="mb-1 text-base font-semibold" style={{ color: ui.accent }}>
        Paslaugų paieška
      </h3>
      <p className="mb-4 text-xs" style={{ color: ui.textMuted }}>
        Meistrai, remontas, valymas — pagal miestą ir skubumą
      </p>

      <input
        type="text"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="Aprašykite problemą..."
        className="mb-3 w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
        style={{ borderColor: ui.border, color: ui.text }}
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <select
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          className="w-full rounded-xl border px-3 py-2.5 text-sm"
          style={{ borderColor: ui.border }}
        >
          <option value="">Bet kokia paslauga</option>
          {SERVICE_SPECIALTIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-full rounded-xl border px-3 py-2.5 text-sm"
          style={{ borderColor: ui.border }}
        >
          <option value="">Visi miestai</option>
          {SERVICE_CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {SERVICE_URGENCY_OPTIONS.map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setUrgency(urgency === u ? "" : u)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold transition"
            style={{
              backgroundColor: urgency === u ? ui.accent : `${ui.accent}10`,
              color: urgency === u ? "#fff" : ui.accent,
            }}
          >
            {u}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={runSearch}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl py-3 text-base font-bold text-white disabled:opacity-70"
        style={{ backgroundColor: ui.cta }}
      >
        {busy ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Ieškoma…
          </>
        ) : (
          "Rasti meistrą"
        )}
      </button>
    </div>
  );
}
