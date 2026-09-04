import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VERTICAL_PRESENTATION_CONTRACTS,
  presentationContractForListing,
  cardAttributeLinesForListing,
  enabledViewModesForVertical,
  filterableAttributeKeysForVertical,
} from "@/lib/vertical-presentation-contract";
import { getListingDetailRows } from "@/lib/listing-display";
import type { Listing } from "@/lib/types";

const baseListing: Listing = {
  id: "t-1",
  title: "Test",
  price: 100,
  location: "Vilnius",
  images: [],
  category: "vehicles",
  tags: [],
  sellerId: "s-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  attributes: {},
};

function listing(overrides: Partial<Listing>): Listing {
  return { ...baseListing, ...overrides };
}

test("22A-1: covers every canonical vertical (no parallel registry)", () => {
  assert.deepEqual(Object.keys(VERTICAL_PRESENTATION_CONTRACTS).sort(), [
    "CLOTHING",
    "ELECTRONICS",
    "HOME_GARDEN",
    "JOBS",
    "OTHER",
    "REAL_ESTATE",
    "SERVICES",
    "TRANSPORT",
  ]);
});

test("22A-1: card attribute keys exist in the canonical schema", () => {
  const vehicle = VERTICAL_PRESENTATION_CONTRACTS.TRANSPORT;
  for (const spec of vehicle.cardAttributes) {
    const def = vehicle.attributes.find((a) => a.key === spec.key);
    assert.ok(def, `card attr ${spec.key} missing in canonical schema`);
  }
});

test("22A-1: listing category maps to canonical vertical contract", () => {
  assert.equal(
    presentationContractForListing(listing({ category: "vehicles" }))?.verticalId,
    "TRANSPORT"
  );
  assert.equal(
    presentationContractForListing(listing({ category: "real_estate" }))?.verticalId,
    "REAL_ESTATE"
  );
  assert.equal(
    presentationContractForListing(listing({ category: "home" }))?.verticalId,
    "HOME_GARDEN"
  );
});

test("22A-2: cardAttributeLinesForListing reads only present canonical values", () => {
  const vehicle = listing({
    category: "vehicles",
    attributes: {
      make: "Volvo",
      model: "V70",
      year: "2004",
      mileage: "245 600 km",
      fuelType: "Dyzelinas",
      fakeFabricatedField: "sujgalvota",
    },
  });
  const lines = cardAttributeLinesForListing(vehicle, 10);
  const keys = lines.map((l) => l.key);
  assert.ok(keys.includes("make"));
  assert.ok(keys.includes("mileage"));
  assert.ok(!keys.includes("fakeFabricatedField"));
  assert.equal(lines[0]?.value, "Volvo");
});

test("22A-2: cardAttributeLinesForListing limits to max and orders by contract", () => {
  const vehicle = listing({
    category: "vehicles",
    attributes: {
      make: "BMW",
      model: "320d",
      year: "2003",
      mileage: "220 898 km",
      fuelType: "Dyzelinas",
      transmission: "Mechaninė",
    },
  });
  const lines = cardAttributeLinesForListing(vehicle, 3);
  assert.equal(lines.length, 3);
  assert.equal(lines[0]?.key, "make");
  assert.equal(lines[1]?.key, "model");
  assert.equal(lines[2]?.key, "year");
});

test("22A-2: real-estate card shows rooms/area when present", () => {
  const re = listing({
    category: "real_estate",
    attributes: {
      propertyType: "Butas",
      rooms: "2",
      area: "54 m²",
    },
  });
  const lines = cardAttributeLinesForListing(re, 5);
  assert.deepEqual(
    lines.map((l) => l.key),
    ["propertyType", "rooms", "area"]
  );
});

test("22A-2: jobs card surfaces salary/employment only from canonical keys", () => {
  const jobs = listing({
    category: "jobs",
    attributes: {
      jobTitle: "Vairuotojas",
      employmentType: "Pilnas etatas",
      salaryMin: "1200",
      salaryMax: "1800",
      position: "Vairuotojas", // legacy alias of canonical jobTitle
    },
  });
  const lines = cardAttributeLinesForListing(jobs, 5);
  assert.ok(lines.some((l) => l.key === "employmentType"));
  assert.ok(lines.some((l) => l.key === "salaryMin"));
  // Canonical key wins over legacy alias (jobTitle present → position ignored).
  assert.ok(lines.some((l) => l.key === "jobTitle" && l.value === "Vairuotojas"));
  assert.ok(!lines.some((l) => l.key === "position"));
});

test("22A-2: jobs card reads legacy position/schedule via documented aliases", () => {
  const jobs = listing({
    category: "jobs",
    attributes: {
      position: "Programuotojas",
      schedule: "Hibridas",
      experience: "3+ m.",
    },
  });
  const lines = cardAttributeLinesForListing(jobs, 5);
  assert.ok(lines.some((l) => l.key === "jobTitle" && l.value === "Programuotojas"));
  assert.ok(
    lines.some((l) => l.key === "employmentType" && l.value === "Hibridas")
  );
  assert.ok(!lines.some((l) => l.key === "experience"));
});

test("22A-5: view-mode capability — REAL_ESTATE map PRIMARY, JOBS NOT_APPLICABLE", () => {
  const re = enabledViewModesForVertical("REAL_ESTATE");
  const map = re.find((m) => m.mode === "map");
  assert.equal(map?.enabled, true);
  assert.equal(map?.mapLevel, "PRIMARY");

  const jobs = enabledViewModesForVertical("JOBS");
  const jobsMap = jobs.find((m) => m.mode === "map");
  assert.equal(jobsMap?.enabled, false);
  assert.equal(jobsMap?.mapLevel, "NOT_APPLICABLE");
});

test("22A-3: filterable keys match canonical schema (no invented taxonomy)", () => {
  const keys = filterableAttributeKeysForVertical("REAL_ESTATE");
  assert.ok(keys.includes("propertyType"));
  assert.ok(keys.includes("rooms"));
  assert.ok(!keys.includes("fakeKey"));
});

test("22A-4: detail rows re-ordered by vertical priority", () => {
  const vehicle = listing({
    category: "vehicles",
    attributes: {
      make: "Volvo",
      model: "V70",
      year: "2004",
      mileage: "245 600 km",
      fuelType: "Dyzelinas",
      transmission: "Mechaninė",
      taExpiry: "2026-08",
    },
  });
  const rows = getListingDetailRows(vehicle);
  const labels = rows.map((r) => r.label);
  const idxMake = labels.findIndex((l) => l === "Markė");
  const idxMileage = labels.findIndex((l) => l === "Rida (km)");
  const idxTa = labels.findIndex((l) => l === "TA galioja iki");
  assert.ok(idxMake >= 0);
  assert.ok(idxMileage >= 0);
  if (idxTa >= 0) {
    assert.ok(idxTa > idxMake, "legacy TA row must come after canonical primary rows");
  }
});
