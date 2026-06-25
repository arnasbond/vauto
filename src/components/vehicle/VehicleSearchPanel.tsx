"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import { VEHICLE_MAKES } from "@/lib/vehicle-catalog";
import { usePortalSearchSubmit } from "@/hooks/usePortalSearchSubmit";

export function VehicleSearchPanel() {
  const { searchQuery } = useVauto();
  const { submitSearch, busy } = usePortalSearchSubmit();
  const ui = getPortalUi("autoplius");
  const [keyword, setKeyword] = useState(searchQuery);
  const [make, setMake] = useState("");
  const [city, setCity] = useState("");
  const [priceFrom, setPriceFrom] = useState("");
  const [priceTo, setPriceTo] = useState("");

  const runSearch = () => {
    const parts = [
      keyword.trim(),
      make,
      city,
      priceFrom && `nuo ${priceFrom}`,
      priceTo && `iki ${priceTo}`,
    ].filter(Boolean);
    void submitSearch(parts.join(" ").trim() || "automobiliai");
  };

  return (
    <div
      className="mb-6 rounded-lg border bg-white p-4 shadow-sm"
      style={{ borderColor: ui.border }}
    >
      <h3 className="mb-3 text-base font-bold" style={{ color: ui.accent }}>
        Automobilių paieška
      </h3>

      <label className="mb-1 block text-sm" style={{ color: ui.textMuted }}>
        Raktinis žodis
      </label>
      <input
        type="text"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="pvz. BMW 320d"
        className="mb-3 w-full rounded border px-3 py-2.5 text-sm outline-none focus:ring-1"
        style={{ borderColor: ui.border, color: ui.text }}
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm" style={{ color: ui.textMuted }}>
            Markė
          </label>
          <select
            value={make}
            onChange={(e) => setMake(e.target.value)}
            className="w-full rounded border px-3 py-2.5 text-sm"
            style={{ borderColor: ui.border }}
          >
            <option value="">Visos</option>
            {VEHICLE_MAKES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm" style={{ color: ui.textMuted }}>
            Miestas
          </label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="pvz. Vilnius"
            className="w-full rounded border px-3 py-2.5 text-sm"
            style={{ borderColor: ui.border }}
          />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm" style={{ color: ui.textMuted }}>
            Kaina nuo €
          </label>
          <input
            type="number"
            value={priceFrom}
            onChange={(e) => setPriceFrom(e.target.value)}
            placeholder="Nuo"
            className="w-full rounded border px-3 py-2.5 text-sm"
            style={{ borderColor: ui.border }}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm" style={{ color: ui.textMuted }}>
            iki €
          </label>
          <input
            type="number"
            value={priceTo}
            onChange={(e) => setPriceTo(e.target.value)}
            placeholder="iki"
            className="w-full rounded border px-3 py-2.5 text-sm"
            style={{ borderColor: ui.border }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={runSearch}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded py-3 text-base font-bold text-white shadow-sm transition hover:opacity-95 disabled:opacity-70"
        style={{ backgroundColor: ui.cta }}
      >
        {busy ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Ieškoma…
          </>
        ) : (
          "Ieškoti"
        )}
      </button>
    </div>
  );
}
