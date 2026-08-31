/**
 * VAUTO Cross-Vertical Safety Containment — vehicle extraction gate.
 *
 * Proves the live P1 fix: `extractVehicleSpecsFromChat`, VIN reconciliation,
 * year-conflict handling, vehicle title generation and vehicle description
 * rebuilding run ONLY for canonical transport/vehicle categories. Every other
 * category (real_estate, electronics, clothing, services, jobs, home, other,
 * unknown/malformed) fails closed as non-vehicle, while generic price,
 * negotiable-price and natural-language description edits keep working for
 * every category.
 *
 * Harness: the real `runVautoAgent` field-update branch (same pattern as
 * `year-conflict-live-merge.test.ts`). The vehicle-shaped texts below were
 * probed to REACH the deterministic field-update branch for every category
 * (pre-gate they polluted non-vehicle drafts; post-gate they must be inert).
 * `authUserId` is unset so the DB-backed prefetch never runs.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runVautoAgent } from "../../vauto-agent.js";
import type { VautoAgentRequest } from "../../vauto-agent.js";
import { deriveVinReviewState } from "../../../shared/vin-review.js";
import {
  isListingCategoryId,
  isVehicleFamilyCategory,
} from "../../../shared/category-registry.js";

const VALID_VIN = "WBAZZZ8VZM1234567";

/** Vehicle-shaped text proven to reach the field-update branch for every category. */
const VEHICLE_TEXT = "Rida 160000 km, automatinė, 2019 metų";

function vehicleAttributes(): Record<string, string> {
  return {
    make: "BMW",
    model: "320d",
    year: "2020",
    mileage: "150000",
    techInspection: "2025-01",
    transmission: "Automatinė",
    fuelType: "Dyzelinas",
    sellerType: "private",
  };
}

function nonVehicleAttributes(kind: string): Record<string, string> {
  switch (kind) {
    case "real_estate":
      return { propertyType: "Butas", area: "62", rooms: "3", location: "Vilnius", sellerType: "private" };
    case "electronics":
      return { manufacturer: "Apple", deviceModel: "iPhone 13", storage: "128 GB", condition: "Gera", sellerType: "private" };
    case "clothing":
      return { clothingType: "Striukė", brand: "Zara", size: "M", material: "Vilna", condition: "Nauja", sellerType: "private" };
    case "services":
      return { serviceType: "Automobilių remontas", serviceLocation: "Kaunas", sellerType: "private" };
    case "jobs":
      return { jobTitle: "Automobilių pardavėjas", employmentType: "Pilnas etatas", location: "Vilnius", sellerType: "private" };
    default:
      return { sellerType: "private" };
  }
}

const TITLES: Record<string, string> = {
  vehicles: "BMW 320d",
  transport: "BMW 320d",
  real_estate: "Butas Vilniuje",
  electronics: "iPhone 13",
  clothing: "Zara striukė",
  services: "Automobilių remontas Kaune",
  jobs: "Automobilių pardavėjas",
  home: "Sofa Vilniuje",
  other: "Neaiški prekė",
};

function baseDraft(category: string, attributes: Record<string, string>) {
  const isVehicle = category === "vehicles" || category === "transport";
  return {
    title: TITLES[category] ?? TITLES.other,
    description: isVehicle ? "BMW 320d 2019 m." : "Parduodu. Detalės susitarus.",
    price: 9000,
    location: "Vilnius",
    category,
    attributes,
    listingFlowState: "DRAFT_READY" as const,
  };
}

function requestFor(
  listingDraft: ReturnType<typeof baseDraft>,
  userText: string
): VautoAgentRequest {
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
  const draft = (response.actions as { listingDraft: { attributes?: Record<string, string> } })
    .listingDraft;
  return draft.attributes ?? {};
}

function draftOf(response: Awaited<ReturnType<typeof runVautoAgent>>) {
  return (response.actions as { listingDraft: ReturnType<typeof baseDraft> }).listingDraft;
}

const VEHICLE_ONLY_KEYS = [
  "make",
  "model",
  "year",
  "engine",
  "powerKw",
  "fuelType",
  "mileage",
  "transmission",
  "vin",
  "vinCandidate",
  "vinUncertain",
  "vinConflict",
  "yearConflict",
  "yearConflictCandidate",
] as const;

describe("Cross-vertical gate — transport drafts keep full vehicle behavior", () => {
  it("vehicle specification text still updates vehicle attributes, title and description", async () => {
    const response = await runVautoAgent(
      requestFor(baseDraft("vehicles", vehicleAttributes()), "Rida 180000 km, 2.0 ltr, mechaninė, 2020 metų")
    );
    const attrs = attrsOf(response);
    assert.equal(attrs.year, "2020");
    assert.equal(attrs.mileage, "180000");
    assert.ok(String(attrs.engine ?? "").length > 0, "engine must be extracted");
    const draft = draftOf(response);
    assert.match(String(draft.title ?? ""), /2020/, "vehicle title must be rewritten with the year");
    assert.notEqual(draft.description, "BMW 320d 2019 m.", "vehicle description must be rebuilt");
  });

  it("chat-text VIN still becomes a candidate (not canonical) on transport drafts", async () => {
    const response = await runVautoAgent(
      requestFor(baseDraft("vehicles", vehicleAttributes()), `VIN yra ${VALID_VIN}`)
    );
    const attrs = attrsOf(response);
    assert.equal(attrs.vin, undefined);
    assert.equal(attrs.vinCandidate, VALID_VIN);
    assert.equal(deriveVinReviewState(attrs).status, "candidate");
  });

  it("year conflict still opens on transport drafts", async () => {
    const response = await runVautoAgent(
      requestFor(baseDraft("vehicles", vehicleAttributes()), "2018")
    );
    const attrs = attrsOf(response);
    assert.equal(attrs.year, "2020");
    assert.equal(attrs.yearConflict, "true");
    assert.equal(attrs.yearConflictCandidate, "2018");
  });
});

describe("Cross-vertical gate — non-transport drafts never enter the vehicle branch", () => {
  const NON_VEHICLE_CASES: Array<{ category: string; kind: string }> = [
    { category: "real_estate", kind: "real_estate" },
    { category: "electronics", kind: "electronics" },
    { category: "clothing", kind: "clothing" },
    { category: "services", kind: "services" },
    { category: "jobs", kind: "jobs" },
    { category: "home", kind: "other" },
    { category: "other", kind: "other" },
    { category: "NeaiškiKategorija123", kind: "other" },
  ];

  for (const c of NON_VEHICLE_CASES) {
    it(`${c.category} draft + vehicle-shaped text gets zero vehicle pollution`, async () => {
      const draft = baseDraft(c.category, nonVehicleAttributes(c.kind));
      const response = await runVautoAgent(requestFor(draft, VEHICLE_TEXT));
      const attrs = attrsOf(response);
      const nextDraft = draftOf(response);
      for (const key of VEHICLE_ONLY_KEYS) {
        assert.equal(attrs[key], undefined, `vehicle key ${key} must never be added to a ${c.category} draft`);
      }
      // Known categories stay unchanged; unknown/malformed categories must
      // fail closed as non-vehicle (normalization may coerce them to "other").
      assert.equal(
        isVehicleFamilyCategory(nextDraft.category),
        false,
        `a ${c.category} draft must never resolve into the vehicle family`
      );
      if (isListingCategoryId(c.category)) {
        assert.equal(nextDraft.category, c.category, "known non-vehicle category must remain unchanged");
      }
      assert.equal(nextDraft.title, draft.title, "non-vehicle title must never be rewritten");
      assert.equal(
        nextDraft.description,
        draft.description,
        "non-vehicle description must never be rebuilt from vehicle specs"
      );
      if (c.kind === "real_estate") assert.equal(attrs.area, "62", "RE fields must survive untouched");
      if (c.kind === "electronics") assert.equal(attrs.storage, "128 GB", "electronics fields must survive untouched");
      if (c.kind === "clothing") assert.equal(attrs.size, "M", "clothing fields must survive untouched");
      if (c.kind === "services") assert.equal(attrs.serviceType, "Automobilių remontas", "service type must survive");
      if (c.kind === "jobs") assert.equal(attrs.jobTitle, "Automobilių pardavėjas", "job title must survive");
    });
  }
});

describe("Cross-vertical gate — generic non-vehicle editing still works", () => {
  it("price editing still works for real_estate", async () => {
    const draft = baseDraft("real_estate", nonVehicleAttributes("real_estate"));
    const response = await runVautoAgent(requestFor(draft, "Kaina 150000"));
    assert.equal(draftOf(response).price, 150000, "generic price edit must still apply");
    for (const key of VEHICLE_ONLY_KEYS) {
      assert.equal(attrsOf(response)[key], undefined);
    }
  });

  it("negotiable price still works for electronics", async () => {
    const draft = baseDraft("electronics", nonVehicleAttributes("electronics"));
    const response = await runVautoAgent(requestFor(draft, "Kaina sutartinė"));
    const next = draftOf(response);
    assert.equal(next.price, 0, "negotiable price zeroes the price");
    const priceLabel = String(
      (next as { priceLabel?: string }).priceLabel ?? ""
    ).toLowerCase();
    assert.match(priceLabel, /sutartin|susitar/i, "negotiable label must be applied");
    for (const key of VEHICLE_ONLY_KEYS) {
      assert.equal(attrsOf(response)[key], undefined);
    }
  });

  it("natural-language description removal still works for real_estate", async () => {
    const draft = baseDraft("real_estate", nonVehicleAttributes("real_estate"));
    const withDesc = { ...draft, description: "Parduodu. Detalės susitarus." };
    const response = await runVautoAgent(requestFor(withDesc, "Rida 160000 km, pašalink susitarus"));
    const next = draftOf(response);
    assert.ok(!/susitarus/i.test(String(next.description ?? "")), "removed phrase must disappear from the description");
    for (const key of VEHICLE_ONLY_KEYS) {
      assert.equal(attrsOf(response)[key], undefined);
    }
  });
});
