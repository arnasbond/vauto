/**
 * E2.8 — CLIENT facet interpretation provenance (the homepage chips path).
 *
 * `interpretAiFacets` builds the „VAUTO suprato" chips. Make/model grounding
 * is TOKEN-BOUNDARY only — ordinary words may never invent a brand
 * (the live bug: „reikia" contains „kia" → Markė Kia).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { interpretAiFacets } from "@/lib/ai-facet-interpretation";

function chipValue(field: string, query: string): string | undefined {
  const chips = interpretAiFacets(query).chips;
  return chips.find((c) => c.field === field)?.value;
}

describe("E2.8 — client facet interpretation provenance", () => {
  it("advisory sentence invents NO make chip (reikia is not Kia)", () => {
    const q =
      "Nežinau ko noriu, bet reikia šeimai patikimo automobilio iki 20 tūkst. eurų, ką siūlytum?";
    assert.equal(
      chipValue("make", q),
      undefined,
      "no invented brand from an ordinary word substring"
    );
    assert.equal(chipValue("model", q), undefined);
  });

  it("explicit make grounds as a token (Kia Sportage iki 20000)", () => {
    const q = "Kia Sportage iki 20000";
    assert.equal(chipValue("make", q), "Kia");
  });

  it("explicit search verb phrase keeps the grounded make (surask Kia Sportage iki 20000)", () => {
    const q = "surask Kia Sportage iki 20000";
    assert.equal(chipValue("make", q), "Kia");
  });

  it("facet query without any make invents none (automobiliai iki 20000)", () => {
    assert.equal(chipValue("make", "automobiliai iki 20000"), undefined);
    assert.equal(chipValue("model", "automobiliai iki 20000"), undefined);
  });

  it("ordinary Lithuanian words never become brands (patikimo / šeimai / tūkst)", () => {
    for (const q of [
      "patikimo automobilio iki 20000",
      "šeimai tinkamo automobilio",
      "20 tūkst. eurų automobiliui",
    ]) {
      assert.equal(chipValue("make", q), undefined, q);
    }
  });
});
