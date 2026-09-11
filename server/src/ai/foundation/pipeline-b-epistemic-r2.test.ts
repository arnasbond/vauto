/**
 * FAIL-FIRST — R2 split-brain convergence: Pipeline B (vauto-unified two-pass)
 * must obey the SAME epistemic fact-provenance contract as Pipeline A.
 *
 * RED before fix: Pipeline B still ships fabrication-enabling instructions —
 *   - NATURAL_SALES_COPY_DIRECTIVE ("Rašyk turtingą, šiltą ir engaginantį…")
 *   - "MASTER SALES COPYWRITER — PASS 2 CREATIVE WRITE"
 *   - CREATIVE_SCHEMA ("turtingas, šiltas … description")
 *   while the same directive also says "Naudok TIK faktus" — a live
 *   contradiction that lets a sparse real-estate SELL turn invent facts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  NATURAL_SALES_COPY_DIRECTIVE,
  FACTUAL_EXTRACTION_DIRECTIVE,
  getCategoryPrompter,
} from "../vauto-unified.js";

const VUNIFIED_SRC = readFileSync(
  new URL("../vauto-unified.ts", import.meta.url),
  "utf8"
);

describe("R2 — Pipeline B epistemic contract (fact-provenance, not rich-copy)", () => {
  it("NATURAL_SALES_COPY_DIRECTIVE no longer orders invented/engaging copy", () => {
    assert.ok(
      !/turtingą|engaginant/i.test(NATURAL_SALES_COPY_DIRECTIVE),
      "must not order 'rich/engaging' (invention) copy"
    );
  });

  it("NATURAL_SALES_COPY_DIRECTIVE grounds writing in known facts", () => {
    assert.match(NATURAL_SALES_COPY_DIRECTIVE, /fakt/i, "must reference facts");
    assert.match(
      NATURAL_SALES_COPY_DIRECTIVE,
      /tik.*fakt|fakt.*tik|neišgalvok|NEišgalvok/i,
      "must restrict to known facts / forbid invention"
    );
  });

  it("real_estate prompter declares unknown fields unknown until supplied", () => {
    const { prompt } = getCategoryPrompter("NT");
    assert.ok(!/turtingą|engaginant/i.test(prompt), "no rich/engaging order in real_estate");
    assert.match(prompt, /tik jei (nurodyta|pateikta)|neišgalvok|NEišgalvok/i, "real_estate grounding");
  });

  it("vauto-unified no longer ships MASTER SALES COPYWRITER or rich-description schema", () => {
    assert.ok(!/MASTER SALES COPYWRITER/i.test(VUNIFIED_SRC), "no MASTER SALES COPYWRITER");
    assert.ok(!/turtingas, šiltas/i.test(VUNIFIED_SRC), "no 'rich, warm' description order");
  });

  it("FACTUAL_EXTRACTION_DIRECTIVE remains fact-only (Pass 1 unaffected)", () => {
    assert.match(FACTUAL_EXTRACTION_DIRECTIVE, /facts|fakt|only/i);
  });
});
