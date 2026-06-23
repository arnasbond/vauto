"use client";

import { useState } from "react";
import { useVauto } from "@/context/VautoContext";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import {
  MUNICIPALITIES,
  PROPERTY_TYPES,
  TRANSACTION_TYPES,
} from "@/lib/real-estate-catalog";

const ROOM_OPTIONS = ["1", "2", "3", "4", "5+"] as const;

export function RealEstateSearchPanel() {
  const { searchQuery, setSearchQuery } = useVauto();
  const ui = getPortalUi("aruodas");
  const [keyword, setKeyword] = useState(searchQuery);
  const [propertyType, setPropertyType] = useState("");
  const [transaction, setTransaction] = useState("Pardavimui");
  const [municipality, setMunicipality] = useState("");
  const [rooms, setRooms] = useState("");
  const [priceTo, setPriceTo] = useState("");

  const runSearch = () => {
    const typeLabel = PROPERTY_TYPES.find((p) => p.id === propertyType)?.label;
    const parts = [
      keyword.trim(),
      typeLabel,
      transaction,
      municipality.replace(" miesto", "").replace(" rajono", ""),
      rooms && `${rooms} kamb`,
      priceTo && `iki ${priceTo}`,
      "nt",
    ].filter(Boolean);
    setSearchQuery(parts.join(" ").trim() || "butai nuoma");
  };

  return (
    <div
      className="mb-6 rounded-lg border bg-white p-4 shadow-sm"
      style={{ borderColor: ui.border }}
    >
      <h3 className="mb-1 text-base font-bold" style={{ color: ui.accent }}>
        Nekilnojamojo turto paieška
      </h3>
      <p className="mb-4 text-xs" style={{ color: ui.textMuted }}>
        Butai, namai, sklypai ir komercinės patalpos
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        {TRANSACTION_TYPES.map((tx) => (
          <button
            key={tx}
            type="button"
            onClick={() => setTransaction(tx)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold transition"
            style={{
              backgroundColor: transaction === tx ? ui.accent : `${ui.accent}12`,
              color: transaction === tx ? "#fff" : ui.accent,
            }}
          >
            {tx}
          </button>
        ))}
      </div>

      <label className="mb-1 block text-sm" style={{ color: ui.textMuted }}>
        Raktinis žodis
      </label>
      <input
        type="text"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="pvz. 3 kambarių butas"
        className="mb-3 w-full rounded border px-3 py-2.5 text-sm outline-none"
        style={{ borderColor: ui.border, color: ui.text }}
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm" style={{ color: ui.textMuted }}>
            Objekto tipas
          </label>
          <select
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value)}
            className="w-full rounded border px-3 py-2.5 text-sm"
            style={{ borderColor: ui.border }}
          >
            <option value="">Visi</option>
            {PROPERTY_TYPES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm" style={{ color: ui.textMuted }}>
            Savivaldybė
          </label>
          <select
            value={municipality}
            onChange={(e) => setMunicipality(e.target.value)}
            className="w-full rounded border px-3 py-2.5 text-sm"
            style={{ borderColor: ui.border }}
          >
            <option value="">Visos</option>
            {MUNICIPALITIES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm" style={{ color: ui.textMuted }}>
            Kambariai
          </label>
          <select
            value={rooms}
            onChange={(e) => setRooms(e.target.value)}
            className="w-full rounded border px-3 py-2.5 text-sm"
            style={{ borderColor: ui.border }}
          >
            <option value="">Bet kiek</option>
            {ROOM_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm" style={{ color: ui.textMuted }}>
            Kaina iki €
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
        className="w-full rounded py-3 text-base font-bold text-white shadow-sm"
        style={{ backgroundColor: ui.cta }}
      >
        Ieškoti
      </button>
    </div>
  );
}
