"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import {
  CLOTHING_SIZES,
  POPULAR_BRANDS,
  VINTED_CATEGORIES,
  subcategoriesFor,
} from "@/lib/clothing-catalog";
import { usePortalSearchSubmit } from "@/hooks/usePortalSearchSubmit";

export function ClothingSearchPanel() {
  const { searchQuery } = useVauto();
  const { submitSearch, busy } = usePortalSearchSubmit();
  const ui = getPortalUi("vinted");
  const [keyword, setKeyword] = useState(searchQuery);
  const [group, setGroup] = useState("Moterims");
  const [subcategory, setSubcategory] = useState("");
  const [size, setSize] = useState("");
  const [brand, setBrand] = useState("");

  const subs = subcategoriesFor(group);

  const runSearch = () => {
    const parts = [keyword.trim(), group, subcategory, size && `dydis ${size}`, brand].filter(
      Boolean
    );
    void submitSearch(parts.join(" ").trim() || "drabužiai");
  };

  return (
    <div
      className="mb-6 rounded-2xl border bg-[#fffdf9] p-4 shadow-sm"
      style={{ borderColor: ui.border }}
    >
      <h3 className="mb-1 text-base font-light" style={{ color: ui.accent }}>
        Ieškoti drabužių
      </h3>
      <p className="mb-4 text-xs" style={{ color: ui.textMuted }}>
        Dydis, prekės ženklas, būklė
      </p>

      <input
        type="text"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="pvz. Zara paltas M"
        className="mb-3 w-full rounded-full border px-4 py-2.5 text-sm outline-none"
        style={{ borderColor: ui.border, color: ui.text }}
      />

      <div className="mb-3 flex flex-wrap gap-2">
        {Object.keys(VINTED_CATEGORIES).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => {
              setGroup(g);
              setSubcategory("");
            }}
            className="rounded-full px-3 py-1 text-xs font-medium transition"
            style={{
              backgroundColor: group === g ? ui.accent : "transparent",
              color: group === g ? "#fff" : ui.textMuted,
              border: `1px solid ${group === g ? ui.accent : ui.border}`,
            }}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <select
          value={subcategory}
          onChange={(e) => setSubcategory(e.target.value)}
          className="w-full rounded-full border px-3 py-2.5 text-sm"
          style={{ borderColor: ui.border }}
        >
          <option value="">Visos kategorijos</option>
          {subs.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={size}
          onChange={(e) => setSize(e.target.value)}
          className="w-full rounded-full border px-3 py-2.5 text-sm"
          style={{ borderColor: ui.border }}
        >
          <option value="">Bet koks dydis</option>
          {CLOTHING_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <select
        value={brand}
        onChange={(e) => setBrand(e.target.value)}
        className="mb-4 w-full rounded-full border px-3 py-2.5 text-sm"
        style={{ borderColor: ui.border }}
      >
        <option value="">Bet koks prekės ženklas</option>
        {POPULAR_BRANDS.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={runSearch}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white disabled:opacity-70"
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
