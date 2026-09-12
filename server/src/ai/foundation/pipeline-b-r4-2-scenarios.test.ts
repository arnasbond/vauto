/**
 * R4.2 — final remediation scenarios (production-path evidence).
 *
 * F: related market-intelligence is ANSWERED via the existing read-only
 *    analyzeMarketPrice capability (real data, not a fabricated number).
 * J: the preference architecture is SEMANTIC (value/diacritic-folded), not a
 *    phrase table — an unseen paraphrase maps to a structured preference.
 * G: explicit SEARCH → SELL transition at the deterministic intent boundary.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runMarketPriceAnalysis } from "../market-price-analysis.js";
import { executeAgentTool, type AgentListingSummary } from "../agent-tools.js";
import { detectServerSellIntent } from "../sell-intent-fallback.js";
import { softPreferenceBoost } from "../search/soft-rank.js";

const BMW_LISTINGS: AgentListingSummary[] = [
  { id: "a", title: "BMW 320d", price: 14500, category: "vehicles", location: "Vilnius" },
  { id: "b", title: "BMW 320i", price: 16000, category: "vehicles", location: "Kaunas" },
  { id: "c", title: "BMW 330d", price: 19000, category: "vehicles", location: "Vilnius" },
];

describe("R4.2 F — related market-intelligence is actually answered (read-only)", () => {
  it("runMarketPriceAnalysis returns a real price range, not a fabricated number", () => {
    const r = runMarketPriceAnalysis(BMW_LISTINGS, { title: "BMW" });
    assert.equal(r.sampleSize, 3);
    assert.equal(r.minPrice, 14500);
    assert.equal(r.maxPrice, 19000);
    assert.match(r.message, /Rinkoje/);
    assert.match(r.message, /14500–19000/);
  });

  it("insufficient comparable listings degrades honestly (no fabricated number)", () => {
    const r = runMarketPriceAnalysis([], { title: "BMW" });
    assert.equal(r.sampleSize, 0);
    assert.equal(r.medianPrice, null);
    assert.match(r.message, /Nepakanka/);
  });

  it("the real analyzeMarketPrice tool path returns the answer", async () => {
    const res = await executeAgentTool(
      "analyzeMarketPrice",
      { title: "BMW" },
      {
        userCity: "Vilnius",
        userRole: "buyer",
        contact: "",
        listingsSnapshot: BMW_LISTINGS,
      }
    );
    const message = (res.result as { message?: string }).message;
    assert.ok(message, "tool returns a message");
    assert.match(message, /Rinkoje/);
    assert.match(message, /14500–19000/);
  });
});

describe("R4.2 J — unseen paraphrase via semantics, not phrase tables", () => {
  const wagon = {
    id: "w",
    title: "BMW 320",
    category: "vehicles",
    location: "Kaunas",
    price: 17000,
    attributes: { bodyType: "universalas" },
  };
  const sedan = {
    id: "s",
    title: "BMW 320",
    category: "vehicles",
    location: "Kaunas",
    price: 17000,
    attributes: { bodyType: "sedanas" },
  };

  it("diacritic/inflected preference value still matches via folding (no exact-phrase table)", () => {
    // "universalą" (accusative) and "UNIVERSALAS" both mean the same preference.
    assert.equal(softPreferenceBoost(wagon, { bodyType: "universalą" }), 2);
    assert.equal(softPreferenceBoost(wagon, { bodyType: "UNIVERSALAS" }), 2);
    assert.equal(softPreferenceBoost(sedan, { bodyType: "universalą" }), 0);
  });
});

describe("R4.2 G — explicit SEARCH → SELL transition", () => {
  it("search utterance is NOT sell; explicit sell transition IS sell", () => {
    assert.equal(detectServerSellIntent("Ieškau BMW"), false);
    assert.equal(detectServerSellIntent("Dabar noriu parduoti savo BMW"), true);
    assert.equal(detectServerSellIntent("Noriu parduoti BMW"), true);
  });
});
