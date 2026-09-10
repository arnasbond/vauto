/**
 * FAIL-FIRST — R1 epistemic instruction consistency + sparse CREATE routing.
 *
 * RED before fix:
 *   - isSparseSellRequest does NOT recognize the CREATE family
 *     ("Noriu įdėti buto skelbimą") — only the SELL family ("parduoti").
 *   - the assembled model instruction surface (supervisor + gemini rules)
 *     still contains "turtinga/turtingu/TURTINGU description" contradictions
 *     to FAKTO PROVENANCIJA.
 *   - the create_listing_draft TOOL SCHEMA still says "turtinga description"
 *     and has no real_estate grounding.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSparseSellRequest, detectServerSellIntent, buildSellClarificationReply } from "../sell-intent-fallback.js";
import { buildVautoAgentSystemInstruction } from "../agent-system-instruction.js";
import { AGENT_FUNCTION_DECLARATIONS } from "../agent-tools.js";

const RICH_DESCRIPTION_CONTRADICTION =
  /turting\w*\s+(?:description|aprašym\w*)/i;

const CREATE_SPARSE_CASES = [
  "Noriu įdėti buto skelbimą",
  "Noriu įkelti buto skelbimą",
  "Įdėk mano buto skelbimą",
  "Norėčiau įdėti skelbimą",
  "Padėk įkelti buto skelbimą",
];

const FACTUAL_NOT_SPARSE_CASES = [
  "2 kambarių butas Antakalnyje, 62 m²",
  "Parduodu Volvo V70 2006, dyzelis",
  "iPhone 16 Pro 256 GB",
  "3 kambarių butas Vilniuje, 80 m², 5 aukštas",
];

describe("R1-B — sparse routing understands the CREATE family (not only SELL)", () => {
  it("create-family sparse utterances are recognized as sparse", () => {
    for (const c of CREATE_SPARSE_CASES) {
      assert.equal(detectServerSellIntent(c), true, `sell intent: ${c}`);
      assert.equal(isSparseSellRequest(c), true, `sparse: ${c}`);
    }
  });

  it("factual sell turns are NOT reduced to empty skeleton", () => {
    for (const c of FACTUAL_NOT_SPARSE_CASES) {
      assert.equal(isSparseSellRequest(c), false, `factual: ${c}`);
    }
  });
});

describe("R1-A — instruction surface has no rich-description contradiction", () => {
  it("assembled full instruction drops every 'rich description' order", () => {
    const full = buildVautoAgentSystemInstruction("full");
    assert.ok(!RICH_DESCRIPTION_CONTRADICTION.test(full), "no turtingas description order");
  });

  it("assembled instruction keeps the epistemic doctrine", () => {
    const full = buildVautoAgentSystemInstruction("full");
    assert.match(full, /FAKTO PROVENANCIJA|EPISTEMIN/i);
    assert.match(full, /FAKTAS/i);
    assert.match(full, /IŠVADA/i);
    assert.match(full, /NEŽINOMA/i);
  });
});

describe("R1-A — create_listing_draft TOOL SCHEMA obeys the epistemic contract", () => {
  const decl = AGENT_FUNCTION_DECLARATIONS.find(
    (d) => d.name === "create_listing_draft"
  );

  it("create_listing_draft declaration exists", () => {
    assert.ok(decl, "create_listing_draft must be declared");
  });

  it("tool description no longer orders a 'rich' description", () => {
    assert.ok(decl, "decl");
    const desc = String((decl as { description?: string }).description ?? "");
    assert.ok(!/turtinga description/i.test(desc), "no 'turtinga description' order");
    assert.ok(!/turting\w*\s+(?:description|aprašym)/i.test(desc), "no rich-description contradiction");
  });

  it("tool description grounds the description in known facts", () => {
    assert.ok(decl, "decl");
    const desc = String((decl as { description?: string }).description ?? "");
    assert.match(desc, /fakt/i, "must reference facts/provenance");
    assert.match(desc, /real_estate/i, "must ground real_estate");
  });

  it("tool description parameter carries real_estate grounding", () => {
    assert.ok(decl, "decl");
    const params = (
      decl as unknown as { parameters?: { properties?: Record<string, { description?: string }> } }
    ).parameters;
    const descParam = params?.properties?.description?.description ?? "";
    assert.match(descParam, /real_estate/i, "description param must ground real_estate");
    assert.ok(!/turting\w*\s+(?:description|aprašym)/i.test(descParam), "no rich-description contradiction in param");
  });
});

describe("R1-C/D — sparse SELL/CREATE response is fact-grounding, not fabrication", () => {
  it("owner phrase produces an EMPTY description and real_estate category", () => {
    const r = buildSellClarificationReply("Noriu įdėti buto skelbimą", {
      userCity: "Vilnius",
      contact: "+37060000000",
    });
    assert.equal(r.action.type, "listing_draft");
    assert.equal(r.action.listingDraft.description, "", "no fabricated description");
    assert.equal(r.action.listingDraft.price, 0, "no fabricated price");
    assert.equal(r.action.listingDraft.category, "real_estate", "category retained");
    assert.equal(r.action.listingDraft.listingFlowState, "DRAFTING_TEXT");
  });

  it("owner phrase reply contains no Omniva/parcel/courier narrative", () => {
    const r = buildSellClarificationReply("Noriu įdėti buto skelbimą", {
      userCity: "Vilnius",
      contact: "+37060000000",
    });
    assert.ok(
      !/Omniva|paštomat|siuntim|kurjer/i.test(r.reply),
      "no parcel logistics for real_estate"
    );
  });
});
