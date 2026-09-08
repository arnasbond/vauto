/**
 * Universal Fact Core — cross-vertical deterministic conflict core regression.
 *
 * Covers the new RE (area/yearBuilt) and electronics (storage) producers plus
 * the certified rooms/workType/year reducers, and proves:
 *   - non-vehicle drafts are never mutated by vehicle-spec extraction;
 *   - conflict lifecycle (detect → one clarification → resolve → tombstones);
 *   - markers survive client-side draft-state allowance (client set is a
 *     separate module, asserted via its exported key list);
 *   - markers are stripped at the persistence boundary;
 *   - markers are redacted from model-visible context.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runVautoAgent } from "../../vauto-agent.js";
import type { VautoAgentRequest } from "../../vauto-agent.js";
import {
  VERTICAL_CONFLICT_FIELDS,
  extractAreaVariants,
  extractStorageVariants,
  extractYearBuiltVariants,
  normalizeAreaValue,
  normalizeStorageValue,
  normalizeYearBuiltValue,
  resolveAmbiguousVerticalPatch,
  resolveVerticalConflictPatch,
  readSemanticConflicts,
  buildSemanticConflictContext,
} from "../vertical-conflict-state.js";
import { EPHEMERAL_LISTING_ATTR_KEYS } from "../../../shared/listing-attributes-sanitize.js";
import { slimListingDraftForLlm } from "../../../shared/llm-context-slice.js";

function reDraft(attributes: Record<string, string>) {
  return {
    title: "Butas Vilniuje",
    description: "Butas Vilniuje.",
    price: 120000,
    location: "Vilnius",
    category: "real_estate",
    attributes: { propertyType: "Butas", sellerType: "private", ...attributes },
    listingFlowState: "DRAFT_READY" as const,
  };
}

function electronicsDraft(attributes: Record<string, string>) {
  return {
    title: "iPhone 13",
    description: "iPhone 13 128 GB.",
    price: 450,
    location: "Vilnius",
    category: "electronics",
    attributes: {
      manufacturer: "Apple",
      deviceModel: "iPhone 13",
      condition: "Naudota",
      sellerType: "private",
      ...attributes,
    },
    listingFlowState: "DRAFT_READY" as const,
  };
}

function requestFor(listingDraft: Record<string, unknown>, userText: string): VautoAgentRequest {
  return {
    messages: [{ role: "user", text: userText }],
    context: {
      userCity: "Vilnius",
      contact: "+37060000000",
      profilePhone: "+37060000000",
      isAuthenticated: true,
      listingDraft,
    },
  };
}

function attrsOf(response: Awaited<ReturnType<typeof runVautoAgent>>): Record<string, string> {
  assert.equal(response.actions.type, "listing_draft");
  const draft = (response.actions as { listingDraft: { attributes?: Record<string, string> } }).listingDraft;
  return draft.attributes ?? {};
}

describe("Universal Fact Core — vertical field registry", () => {
  it("registers the cross-vertical field→category map", () => {
    assert.equal(VERTICAL_CONFLICT_FIELDS.rooms, "real_estate");
    assert.equal(VERTICAL_CONFLICT_FIELDS.area, "real_estate");
    assert.equal(VERTICAL_CONFLICT_FIELDS.yearBuilt, "real_estate");
    assert.equal(VERTICAL_CONFLICT_FIELDS.storage, "electronics");
    assert.equal(VERTICAL_CONFLICT_FIELDS.workType, "jobs");
  });

  it("normalizers accept canonical forms and reject foreign data", () => {
    assert.equal(normalizeAreaValue("62"), "62");
    assert.equal(normalizeAreaValue("62,5"), "62.5");
    assert.equal(normalizeAreaValue("62.5"), "62.5");
    assert.equal(normalizeAreaValue("kambarių"), undefined);
    assert.equal(normalizeYearBuiltValue("1998"), "1998");
    assert.equal(normalizeYearBuiltValue("1998 m."), undefined); // raw must be a bare year
    assert.equal(normalizeYearBuiltValue("1700"), undefined);
    assert.equal(normalizeStorageValue("128 GB"), "128 GB");
    assert.equal(normalizeStorageValue("128gb"), "128 GB");
    assert.equal(normalizeStorageValue("1 TB"), "1 TB");
    assert.equal(normalizeStorageValue("13"), undefined);
  });

  it("extractors capture only explicit, contextual values", () => {
    assert.deepEqual(extractAreaVariants("62 kv butas"), ["62"]);
    assert.deepEqual(extractAreaVariants("plotas 64 m²"), ["64"]);
    assert.deepEqual(extractAreaVariants("62"), []); // bare number is never area
    assert.deepEqual(extractYearBuiltVariants("statybos 1998 m."), ["1998"]);
    assert.deepEqual(extractYearBuiltVariants("pastatytas 2001 metais"), ["2001"]);
    assert.deepEqual(extractYearBuiltVariants("2001"), []); // bare year is never build year
    assert.deepEqual(extractStorageVariants("128 GB atmintis"), ["128 GB"]);
    assert.deepEqual(extractStorageVariants("256 gigabaitų"), ["256 GB"]);
    assert.deepEqual(extractStorageVariants("256"), []); // bare number is never storage
  });
});

describe("Universal Fact Core — resolveVerticalConflictPatch (area/yearBuilt/storage)", () => {
  it("area: first value accepted; equal value no-op; differing value conflicts", () => {
    assert.deepEqual(
      resolveVerticalConflictPatch({ field: "area", category: "real_estate", priorAttributes: {}, incomingValue: "62" }),
      { area: "62" }
    );
    assert.deepEqual(
      resolveVerticalConflictPatch({ field: "area", category: "real_estate", priorAttributes: { area: "62" }, incomingValue: "62" }),
      {}
    );
    assert.deepEqual(
      resolveVerticalConflictPatch({ field: "area", category: "real_estate", priorAttributes: { area: "62" }, incomingValue: "64" }),
      { area: "62", areaConflict: "true", areaConflictCandidate: "64" }
    );
  });

  it("area: wrong category is fail-closed (no patch)", () => {
    assert.deepEqual(
      resolveVerticalConflictPatch({ field: "area", category: "electronics", priorAttributes: { area: "62" }, incomingValue: "64" }),
      {}
    );
  });

  it("area: explicit A/B choice resolves and tombstones", () => {
    const open = resolveVerticalConflictPatch({ field: "area", category: "real_estate", priorAttributes: { area: "62" }, incomingValue: "64" });
    const resolved = resolveVerticalConflictPatch({
      field: "area",
      category: "real_estate",
      priorAttributes: { area: "62", areaConflict: "true", areaConflictCandidate: "64" },
      incomingValue: "64",
    });
    assert.deepEqual(resolved, { area: "64", areaConflict: "", areaConflictCandidate: "" });
    void open;
  });

  it("area: ambiguous multi-variant never picks silently", () => {
    const r = resolveAmbiguousVerticalPatch({
      field: "area",
      category: "real_estate",
      priorAttributes: { area: "62" },
      variants: ["62", "64"],
    });
    assert.deepEqual(r.patch, { area: "62", areaConflict: "true", areaConflictCandidate: "64" });
    assert.equal(r.needsClarification, false);
  });

  it("yearBuilt: conflicting build years open a clarification conflict", () => {
    assert.deepEqual(
      resolveVerticalConflictPatch({ field: "yearBuilt", category: "real_estate", priorAttributes: { yearBuilt: "1998" }, incomingValue: "2001" }),
      { yearBuilt: "1998", yearBuiltConflict: "true", yearBuiltConflictCandidate: "2001" }
    );
  });

  it("storage: conflicting capacities open a clarification conflict; A/B resolves", () => {
    assert.deepEqual(
      resolveVerticalConflictPatch({ field: "storage", category: "electronics", priorAttributes: { storage: "128 GB" }, incomingValue: "256 GB" }),
      { storage: "128 GB", storageConflict: "true", storageConflictCandidate: "256 GB" }
    );
    assert.deepEqual(
      resolveVerticalConflictPatch({
        field: "storage",
        category: "electronics",
        priorAttributes: { storage: "128 GB", storageConflict: "true", storageConflictCandidate: "256 GB" },
        incomingValue: "256 GB",
      }),
      { storage: "256 GB", storageConflict: "", storageConflictCandidate: "" }
    );
  });
});

describe("Universal Fact Core — live runVautoAgent draft update", () => {
  it("RE area conflict opens and resolves through the real path", async () => {
    const first = await runVautoAgent(requestFor(reDraft({ area: "62" }), "plotas 64 kv"));
    const a1 = attrsOf(first);
    assert.equal(a1.area, "62");
    assert.equal(a1.areaConflict, "true");
    assert.equal(a1.areaConflictCandidate, "64");

    const second = await runVautoAgent(
      requestFor(reDraft({ area: "62", areaConflict: "true", areaConflictCandidate: "64" }), "64 kv")
    );
    const a2 = attrsOf(second);
    assert.equal(a2.area, "64");
    assert.equal(a2.areaConflict, undefined);
    assert.equal(a2.areaConflictCandidate, undefined);
  });

  it("electronics storage conflict opens and resolves through the real path", async () => {
    const first = await runVautoAgent(requestFor(electronicsDraft({ storage: "128 GB" }), "256 GB"));
    const a1 = attrsOf(first);
    assert.equal(a1.storage, "128 GB");
    assert.equal(a1.storageConflict, "true");
    assert.equal(a1.storageConflictCandidate, "256 GB");

    const second = await runVautoAgent(
      requestFor(electronicsDraft({ storage: "128 GB", storageConflict: "true", storageConflictCandidate: "256 GB" }), "256 GB")
    );
    const a2 = attrsOf(second);
    assert.equal(a2.storage, "256 GB");
    assert.equal(a2.storageConflict, undefined);
    assert.equal(a2.storageConflictCandidate, undefined);
  });

  it("vehicle-spec extraction NEVER mutates a non-vehicle draft", async () => {
    // Area triggers the deterministic draft-update branch; vehicle specs in the
    // same text must NOT leak in.
    const res = await runVautoAgent(
      requestFor(reDraft({}), "plotas 62, Volvo V70 2021, 150000 km, dyzelis, automatinė, 250 kW")
    );
    const a = attrsOf(res);
    assert.equal(a.area, "62", "RE fact must still apply");
    for (const key of ["make", "model", "year", "mileage", "fuelType", "transmission", "engine", "powerKw", "vin"]) {
      assert.equal(a[key], undefined, `vehicle key "${key}" must never appear on a real_estate draft`);
    }
  });

  it("transport behavior preserved: a vehicle draft still accepts vehicle specs", async () => {
    const vehicleDraft = {
      title: "Volvo V70",
      description: "Volvo V70.",
      price: 5000,
      location: "Vilnius",
      category: "vehicles",
      attributes: { make: "Volvo", model: "V70", sellerType: "private" },
      listingFlowState: "DRAFT_READY" as const,
    };
    const res = await runVautoAgent(requestFor(vehicleDraft, "Volvo V70 2021, benzinas"));
    const a = attrsOf(res);
    assert.equal(a.make, "Volvo");
    assert.equal(a.model, "V70");
    assert.equal(a.year, "2021");
  });
});

describe("Universal Fact Core — persistence & model-visibility boundaries", () => {
  it("new conflict markers are stripped at the persistence boundary", () => {
    for (const key of [
      "areaConflict",
      "areaConflictCandidate",
      "yearBuiltConflict",
      "yearBuiltConflictCandidate",
      "storageConflict",
      "storageConflictCandidate",
      "roomsConflict",
      "workTypeConflict",
    ]) {
      assert.ok(EPHEMERAL_LISTING_ATTR_KEYS.has(key), `persistence strip must drop ${key}`);
    }
  });

  it("new conflict markers never enter the model-visible draft slice", () => {
    const slim = slimListingDraftForLlm({
      category: "real_estate",
      attributes: {
        area: "62",
        areaConflict: "true",
        areaConflictCandidate: "64",
        yearBuiltConflict: "true",
        yearBuiltConflictCandidate: "1998",
        storageConflict: "true",
        storageConflictCandidate: "256 GB",
      },
    });
    assert.ok(slim);
    const slimAttrs = (slim as { attributes?: Record<string, string> }).attributes ?? {};
    assert.equal(slimAttrs.area, "62");
    assert.equal(slimAttrs.areaConflict, undefined);
    assert.equal(slimAttrs.areaConflictCandidate, undefined);
    assert.equal(slimAttrs.yearBuiltConflict, undefined);
    assert.equal(slimAttrs.storageConflict, undefined);
  });
});

describe("Universal Fact Core — remediation: extractor red-team", () => {
  it("area accepts canonical Lithuanian forms (m², m2, kv, plotas apie)", () => {
    for (const [input, expected] of [
      ["62 m²", ["62"]],
      ["62 m2", ["62"]],
      ["62 kv. m", ["62"]],
      ["62 kv", ["62"]],
      ["62 kv butas", ["62"]],
      ["plotas apie 62", ["62"]],
      ["plotas: 62", ["62"]],
      ["2 kambariai, 62 m²", ["62"]],
      ["2021 m. statybos, 62 m²", ["62"]],
    ] as const) {
      assert.deepEqual(extractAreaVariants(input), expected, input);
    }
  });

  it("area rejects unrelated numbers", () => {
    for (const input of ["62 000 €", "Vilnius, 62", "namo nr. 62", "62", "2021 m.", "62 kambariai"]) {
      assert.deepEqual(extractAreaVariants(input), [], input);
    }
  });

  it("yearBuilt accepts construction-year evidence only", () => {
    for (const [input, expected] of [
      ["statybos metai 2021", ["2021"]],
      ["pastatytas 2021", ["2021"]],
      ["2021 m. statybos", ["2021"]],
    ] as const) {
      assert.deepEqual(extractYearBuiltVariants(input), expected, input);
    }
  });

  it("yearBuilt abstains on renovation/purchase/vehicle years (no wrong canonical fact)", () => {
    for (const input of ["renovuotas 2021", "pirktas 2021", "2021 m. automobilis", "62 m², 2021 m."]) {
      assert.deepEqual(extractYearBuiltVariants(input), [], input);
    }
  });

  it("storage disambiguates RAM from device storage", () => {
    for (const [input, expected] of [
      ["256 GB", ["256 GB"]],
      ["256GB", ["256 GB"]],
      ["1 TB", ["1 TB"]],
      ["1TB", ["1 TB"]],
      ["8 GB RAM, 256 GB storage", ["256 GB"]],
      ["8/256 GB", ["256 GB"]],
      ["512GB SSD", ["512 GB"]],
      ["1 TB SSD", ["1 TB"]],
    ] as const) {
      assert.deepEqual(extractStorageVariants(input), expected, input);
    }
  });

  it("storage abstains on RAM-marked values and non-capacity numbers", () => {
    for (const input of ["256 GB RAM", "16 GB RAM", "256 €", "telefonas 256", "256"]) {
      assert.deepEqual(extractStorageVariants(input), [], input);
    }
  });
});

describe("Universal Fact Core — remediation: semantic conflict context", () => {
  it("model-visible context exposes field + canonical + candidate, never internal keys", () => {
    const conflicts = readSemanticConflicts({
      area: "62",
      areaConflict: "true",
      areaConflictCandidate: "64",
      storage: "128 GB",
      storageConflict: "true",
      storageConflictCandidate: "256 GB",
    });
    assert.equal(conflicts.length, 2);
    assert.deepEqual(conflicts[0], { field: "area", label: "plotas", canonical: "62", candidate: "64" });
    assert.deepEqual(conflicts[1], { field: "storage", label: "atmintis", canonical: "128 GB", candidate: "256 GB" });

    const block = buildSemanticConflictContext(conflicts);
    assert.match(block, /plotas/);
    assert.match(block, /62/);
    assert.match(block, /64/);
    assert.match(block, /atmintis/);
    assert.match(block, /128 GB/);
    assert.match(block, /256 GB/);
    assert.doesNotMatch(block, /areaConflict/);
    assert.doesNotMatch(block, /storageConflictCandidate/);
  });

  it("resolved conflict yields empty semantic context (no stale block)", () => {
    const conflicts = readSemanticConflicts({
      area: "64",
      areaConflict: "",
      areaConflictCandidate: "",
    });
    assert.deepEqual(conflicts, []);
    assert.equal(buildSemanticConflictContext(conflicts), "");
  });

  it("malformed/inactive markers yield no semantic context (fail-closed)", () => {
    assert.deepEqual(readSemanticConflicts({ area: "62", areaConflict: "false", areaConflictCandidate: "64" }), []);
    assert.deepEqual(readSemanticConflicts({ area: "62", areaConflict: "true" }), []);
    assert.deepEqual(readSemanticConflicts(undefined), []);
  });
});
