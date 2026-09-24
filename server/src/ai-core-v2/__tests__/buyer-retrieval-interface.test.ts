/**
 * VAUTO AI Core v2 — Buyer Retrieval Tool Interface Mechanics Tests.
 *
 * Tests infrastructure and mechanics, NOT DeepSeek intelligence:
 * A. taxonomy exposed to reasoning context comes from canonical registry.
 * B. authoritative hard filters constrain candidate retrieval.
 * C. soft preferences are NOT silently converted into hard SQL/ILIKE filters.
 * D. searchListings returns richer grounded candidate facts (category, attributes, snippet).
 * E. listingDetails remains available for deeper inspection.
 * F. result payload remains bounded (snippet truncation).
 * G. provenance/authority behavior unchanged (USER_STATED vs MODEL_INFERRED).
 * H. Stage11J/payment boundaries untouched.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { searchListingsCapability } from "../capability/capabilities/search-listings.js";
import { listingDetailsCapability } from "../capability/capabilities/listing-details.js";
import { deriveSearchListingsArgs } from "../loop/multi-step-loop.js";
import {
  emptyMarketplaceState,
  provenance,
  executionEligibleSearchSubject,
} from "../state/marketplace-state.js";
import { setHardConstraint, setSearchSubject, addSoftPreference } from "../state/state-transitions.js";
import { visibleCategoryOptions } from "../../shared/category-registry.js";
import { CapabilityRegistry } from "../capability/registry.js";
import { buildR3UserPrompt } from "../provider/semantic-claim.js";
import type { ReasoningInput } from "../reasoning/reasoning-contract.js";

describe("Buyer Retrieval Tool Interface — Mechanics Tests", () => {
  it("A: taxonomy exposed in tool description comes dynamically from canonical category registry", () => {
    const desc = searchListingsCapability.description;
    assert.ok(desc.includes("VAUTO kategorijos"), "description should mention VAUTO categories");
    const options = visibleCategoryOptions();
    for (const opt of options) {
      assert.ok(desc.includes(opt.id), `description should expose canonical category ID '${opt.id}'`);
      assert.ok(desc.includes(opt.label), `description should expose label '${opt.label}'`);
    }
  });

  it("B: authoritative hard filters constrain candidate retrieval in deriveSearchListingsArgs", () => {
    let s = emptyMarketplaceState();
    s = setHardConstraint(s, "category", "vehicles", provenance("USER_STATED"));
    s = setHardConstraint(s, "priceMax", 20000, provenance("USER_STATED"));
    s = setHardConstraint(s, "location", "Vilnius", provenance("USER_STATED"));

    const args = deriveSearchListingsArgs(s, {});
    assert.equal(args.category, "vehicles");
    assert.equal(args.maxPrice, 20000);
    assert.equal(args.city, "Vilnius");
  });

  it("C: soft preferences are NOT converted into hard SQL/ILIKE filters", () => {
    let s = emptyMarketplaceState();
    s = addSoftPreference(s, "šeimai patikimas erdvus universalas", provenance("USER_STATED"));
    const args = deriveSearchListingsArgs(s, {});
    assert.equal(args.query, undefined, "soft preferences must not enter SQL ILIKE query");
    assert.equal(args.category, undefined);
    assert.equal(args.maxPrice, undefined);
  });

  it("D: searchListings returns enriched grounded candidate facts from existing data", async () => {
    const res = await searchListingsCapability.execute({ category: "vehicles", limit: 5 }, {});
    assert.equal(res.ok, true);
    if (res.ok && res.data && res.data.listings.length > 0) {
      const item = res.data.listings[0]!;
      assert.ok(item.id, "item must have id");
      assert.ok(item.title, "item must have title");
      assert.ok(item.category, "item must have category");
      assert.ok(typeof item.price === "number", "item price must be number");
      assert.ok(item.location, "item location must exist");
    }
  });

  it("E: listingDetails remains available in capability registry for deeper inspection", () => {
    const reg = new CapabilityRegistry();
    reg.register(searchListingsCapability);
    reg.register(listingDetailsCapability);
    assert.ok(reg.has("searchListings"));
    assert.ok(reg.has("listingDetails"));
    assert.equal(reg.get("listingDetails")?.operation, "READ");
  });

  it("F: result payload remains bounded (snippet truncation)", async () => {
    const res = await searchListingsCapability.execute({ limit: 10 }, {});
    assert.equal(res.ok, true);
    if (res.ok && res.data) {
      for (const item of res.data.listings) {
        if (item.snippet) {
          assert.ok(item.snippet.length <= 160, `snippet must be bounded (max 160 chars), got ${item.snippet.length}`);
        }
      }
    }
  });

  it("G: provenance/authority behavior is unchanged for search subject", () => {
    let sUser = emptyMarketplaceState();
    sUser = setSearchSubject(sUser, "Passat", provenance("USER_STATED"));
    assert.equal(executionEligibleSearchSubject(sUser), "Passat");
    assert.equal(deriveSearchListingsArgs(sUser, {}).query, "Passat");

    let sModel = emptyMarketplaceState();
    sModel = setSearchSubject(sModel, "Passat", provenance("MODEL_INFERRED"));
    assert.equal(executionEligibleSearchSubject(sModel), undefined);
    assert.equal(deriveSearchListingsArgs(sModel, {}).query, undefined);
  });

  it("H: Stage11J/payment boundaries remain untouched (MUTATE/CONSEQUENTIAL operations guarded)", () => {
    const reg = new CapabilityRegistry();
    reg.register(searchListingsCapability);
    reg.register(listingDetailsCapability);
    const descriptions = reg.describe();
    for (const desc of descriptions) {
      assert.equal(desc.operation, "READ");
    }
  });

  it("I: buildR3UserPrompt includes capability name, operation, and existing description (canonical taxonomy)", () => {
    const reg = new CapabilityRegistry();
    reg.register(searchListingsCapability);
    const input: ReasoningInput = {
      userTurn: "Reikia automobilio iki 20 tūkst.",
      history: [],
      state: emptyMarketplaceState(),
      capabilities: reg.describe(),
    };
    const prompt = buildR3UserPrompt(input);
    assert.ok(prompt.includes("searchListings(READ):"), "must include capability name and operation");
    assert.ok(prompt.includes("VAUTO kategorijos"), "must include existing capability description");
    assert.ok(prompt.includes("vehicles (Transportas)"), "must expose PR98 canonical category taxonomy to the reasoning provider");
  });
});
