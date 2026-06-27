"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import {
  ITEM_CONDITIONS,
  LT_CITIES,
  nodesAtPath,
} from "@/lib/general-catalog";
import { usePortalSearchSubmit } from "@/hooks/usePortalSearchSubmit";

export function GeneralSearchPanel() {
  const { searchQuery } = useVauto();
  const { submitSearch, busy } = usePortalSearchSubmit();
  const ui = getPortalUi("skelbiu");
  const [keyword, setKeyword] = useState(searchQuery);
  const [path, setPath] = useState<string[]>([]);
  const [city, setCity] = useState("");
  const [condition, setCondition] = useState("");
  const [priceTo, setPriceTo] = useState("");

  const nodes = useMemo(() => nodesAtPath(path), [path]);
  const categoryLabel = path.length ? path.join(" › ") : "";

  const runSearch = () => {
    const parts = [keyword.trim(), categoryLabel, city, condition, priceTo && `iki ${priceTo}`].filter(
      Boolean
    );
    void submitSearch(parts.join(" ").trim() || "skelbimai");
  };

  return (
    <div
      className="mb-6 rounded border bg-white p-4 shadow-sm"
      style={{ borderColor: ui.border }}
    >
      <h3 className="mb-1 text-base font-semibold" style={{ color: ui.accent }}>
        Skelbimų paieška
      </h3>
      <p className="mb-4 text-xs" style={{ color: ui.textMuted }}>
        Prekės, buitis, elektronika ir kt.
      </p>

      {path.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => setPath([])}
            className="font-semibold hover:underline"
            style={{ color: ui.link }}
          >
            Visos kategorijos
          </button>
          {path.map((segment, i) => (
            <span key={segment} className="flex items-center gap-1">
              <span style={{ color: ui.textMuted }}>›</span>
              <button
                type="button"
                onClick={() => setPath(path.slice(0, i + 1))}
                className="hover:underline"
                style={{ color: ui.link }}
              >
                {segment}
              </button>
            </span>
          ))}
        </div>
      )}

      {nodes.length > 0 && path.length < 4 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {nodes.map((node) => (
            <button
              key={node.label}
              type="button"
              onClick={() => setPath([...path, node.label])}
              className="rounded border px-2.5 py-1 text-xs font-medium transition hover:opacity-90"
              style={{ borderColor: ui.border, color: ui.text }}
            >
              {node.label}
            </button>
          ))}
        </div>
      )}

      <input
        type="text"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="pvz. iPhone 13"
        className="mb-3 w-full rounded border px-3 py-2.5 text-sm outline-none"
        style={{ borderColor: ui.border, color: ui.text }}
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-full rounded border px-3 py-2.5 text-sm"
          style={{ borderColor: ui.border }}
        >
          <option value="">Visi miestai</option>
          {LT_CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          className="w-full rounded border px-3 py-2.5 text-sm"
          style={{ borderColor: ui.border }}
        >
          <option value="">Bet kokia būklė</option>
          {ITEM_CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <input
        type="number"
        value={priceTo}
        onChange={(e) => setPriceTo(e.target.value)}
        placeholder="Kaina iki €"
        className="mb-4 w-full rounded border px-3 py-2.5 text-sm"
        style={{ borderColor: ui.border }}
      />

      <button
        type="button"
        onClick={runSearch}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded py-3 text-base font-semibold text-white disabled:opacity-70"
        style={{ backgroundColor: ui.accent }}
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
