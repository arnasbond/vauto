import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseUniversalSearchQuery } from "../universal-search-query.js";
import { normalizeProductSearchQuery } from "../../product-search-query.js";
import { detectServerSellIntent } from "../../sell-intent-fallback.js";
import { planTurn } from "../../planner/planner-engine.js";
import { isExplicitExecutionDirective } from "../../planner/planner-signals.js";

describe("P1 Search and Intent Authority Suite", () => {
  describe("Defect 1: Noriu pirkti nama and Buyer language stripping", () => {
    it("parses 'Noriu pirkti nam&#225;' cleanly into real_estate category browse with no leaked tokens", () => {
      const parsed = parseUniversalSearchQuery("Noriu pirkti namq");
      assert.equal(parsed.canonicalCategory, "real_estate");
      assert.equal(parsed.categoryBrowse, true);
      assert.deepEqual(parsed.freeTextKeywords, []);
    });

    it("parses normalized product query for 'Noriu pirkti nama' to empty or broad browse noun", () => {
      const normalized = normalizeProductSearchQuery("Noriu pirkti namq");
      assert.equal(normalized, "");
    });

    it("preserves entity specificity for BMW E46, iPhone 15 Pro, kotedzas Kaune", () => {
      const bmw = parseUniversalSearchQuery("Noriu pirkti BMW E46");
      assert.equal(bmw.canonicalCategory, "vehicles");
      assert.equal(bmw.categoryBrowse, false);
      const bmwKeys = bmw.freeTextKeywords.map(p => p.toLowerCase());
      assert.ok(bmwKeys.includes("bmw"));
      assert.ok(bmwKeys.includes("e46"));

      const iphone = parseUniversalSearchQuery("Noriu pirkti iPhone 15 Pro");
      assert.equal(iphone.canonicalCategory, "electronics");
      assert.equal(iphone.categoryBrowse, false);
      const iphoneKeys = iphone.freeTextKeywords.map(p => p.toLowerCase());
      assert.ok(iphoneKeys.includes("iphone"));

      const butas = parseUniversalSearchQuery("Domina butas Kaune");
      assert.equal(butas.canonicalCategory, "real_estate");
      assert.equal(butas.location, "Kaunas");
    });

    it("generalizes across un-memorized conversational phrasing", () => {
      const q1 = parseUniversalSearchQuery("Labai norėtume susirasti namą Klaipėdoje");
      assert.equal(q1.canonicalCategory, "real_estate");
      assert.equal(q1.location, "Klaipėda");

      const q2 = parseUniversalSearchQuery("Svarstome įsigyti 2 kambarių butą");
      assert.equal(q2.canonicalCategory, "real_estate");
      assert.equal(q2.verticalAttributes?.rooms, 2);
    });
  });

  describe("Defect 2: Cold Ieškau darbo and Intent Boundaries", () => {
    it("does NOT classify cold 'ieškau darbo' as sell intent", () => {
      const isSell = detectServerSellIntent("ieškau darbo");
      assert.equal(isSell, false);
    });

    it("does NOT force cold 'ieškau darbo' into catalog_search directive", () => {
      const isDirective = isExplicitExecutionDirective("ieškau darbo");
      assert.equal(isDirective, false);
    });

    it("plans clarification/dialog for cold 'ieškau darbo' when no draft exists", () => {
      const decision = planTurn({
        lastUserText: "ieškau darbo",
        messages: [{ role: "user", text: "ieškau darbo" }],
        hasDraft: false,
        isAuthenticated: false,
        hasSearchSession: false,
        modelAvailable: true,
      });
      assert.notEqual(decision.intent, "sell_create");
      assert.notEqual(decision.intent, "catalog_search");
      assert.equal(decision.intent, "clarify_ambiguous");
      assert.equal(decision.needsClarification, true);
    });

    it("routes to sell_create when user has an active jobs draft continuation", () => {
      const decision = planTurn({
        lastUserText: "ieškau darbo virėju Vilniuje",
        messages: [
          { role: "user", text: "Noriu įkelti skelbimą" },
          { role: "assistant", text: "Ką norite pasiūlyti ar kokio darbo ieškote?" },
        ],
        hasDraft: true,
        draftCategory: "jobs",
        draftTitle: "Ieškau darbo",
        isAuthenticated: false,
        hasSearchSession: false,
        modelAvailable: true,
      });
      assert.equal(decision.intent, "sell_create");
    });

    it("routes explicit listing creation for job-seeker to sell_create", () => {
      const decision = planTurn({
        lastUserText: "Noriu įkelti skelbimą, kad ieškau darbo",
        messages: [{ role: "user", text: "Noriu įkelti skelbimą, kad ieškau darbo" }],
        hasDraft: false,
        isAuthenticated: false,
        hasSearchSession: false,
        modelAvailable: true,
      });
      assert.equal(decision.intent, "sell_create");
    });

    it("routes explicit job search with location/keywords to catalog_search", () => {
      const decision = planTurn({
        lastUserText: "Ieškau darbo Vilniuje",
        messages: [{ role: "user", text: "Ieškau darbo Vilniuje" }],
        hasDraft: false,
        isAuthenticated: false,
        hasSearchSession: false,
        modelAvailable: true,
      });
      assert.equal(decision.intent, "catalog_search");
    });
  });
});
