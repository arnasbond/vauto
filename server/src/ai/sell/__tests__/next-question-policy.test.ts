/**
 * VAUTO AI Maturity — Phase 2B golden corpus.
 * Single highest-value missing-fact question policy — deterministic, one question per turn.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  selectNextQuestion,
  normalizeCategory,
  debugPriorityOrder,
  type NextQuestionFacts,
} from "../next-question-policy.js";

function fact(value: unknown, opts?: { confidence?: number; conflict?: boolean }) {
  return { value, confidence: opts?.confidence, conflict: opts?.conflict };
}

describe("Phase 2B — normalizeCategory", () => {
  it("accepts known categories case-insensitively", () => {
    assert.equal(normalizeCategory("VEHICLES"), "vehicles");
    assert.equal(normalizeCategory(" real_estate "), "real_estate");
  });

  it("rejects unknown / empty categories (fail-closed, no question)", () => {
    assert.equal(normalizeCategory("nope"), null);
    assert.equal(normalizeCategory(""), null);
    assert.equal(normalizeCategory(undefined), null);
    assert.equal(
      selectNextQuestion({ category: "nope", facts: {} }),
      null
    );
  });
});

describe("Phase 2B — Transport golden scenarios", () => {
  it("make known + model missing → asks model", () => {
    const facts: NextQuestionFacts = { make: fact("Audi") };
    const result = selectNextQuestion({ category: "vehicles", facts });
    assert.ok(result);
    assert.equal(result!.field, "model");
    assert.equal(result!.reason, "missing_important");
    assert.match(result!.question, /modelis/i);
  });

  it("make and model known → neither is repeated", () => {
    const facts: NextQuestionFacts = { make: fact("Audi"), model: fact("A4") };
    const result = selectNextQuestion({ category: "vehicles", facts });
    assert.notEqual(result?.field, "make");
    assert.notEqual(result?.field, "model");
  });

  it("model missing outranks mileage, year, inspection, transmission and fuel type", () => {
    const facts: NextQuestionFacts = {
      make: fact("BMW"),
      price: fact(15000),
      mileage: fact(150000),
      year: fact(2018),
      techInspection: fact("2026-01"),
      transmission: fact("Automatinė"),
      fuelType: fact("Dyzelinas"),
    };
    const result = selectNextQuestion({ category: "vehicles", facts });
    assert.ok(result);
    assert.equal(result!.field, "model");
    assert.equal(result!.reason, "missing_important");
  });

  it("missing mileage is asked once make/model/price are known", () => {
    const facts: NextQuestionFacts = {
      make: fact("BMW"),
      model: fact("320d"),
      price: fact(15000),
    };
    const result = selectNextQuestion({ category: "vehicles", facts });
    assert.ok(result);
    assert.equal(result!.field, "mileage");
    assert.equal(result!.reason, "missing_important");
    assert.match(result!.question, /rida/i);
  });

  it("missing price outranks vehicle enrichment when make/model are known", () => {
    const facts: NextQuestionFacts = { make: fact("Audi"), model: fact("A4") };
    const result = selectNextQuestion({ category: "vehicles", facts });
    assert.ok(result);
    assert.equal(result!.field, "price");
    assert.equal(result!.reason, "missing_required");
  });

  it("conflicting year outranks price and every other vehicle fact", () => {
    const facts: NextQuestionFacts = {
      make: fact("Toyota"),
      price: fact(9000),
      mileage: fact(150000),
      year: fact("2015", { conflict: true }),
    };
    const result = selectNextQuestion({ category: "vehicles", facts });
    assert.ok(result);
    assert.equal(result!.field, "year");
    assert.equal(result!.reason, "conflict");
    assert.match(result!.question, /metus|metai/i);
  });

  it("uncertain VIN must not be treated as final — surfaced once other facts are known", () => {
    const facts: NextQuestionFacts = {
      make: fact("Volvo"),
      price: fact(12000),
      mileage: fact(80000),
      techInspection: fact("2026-05"),
      transmission: fact("Automatinė"),
      fuelType: fact("Dyzelinas"),
      vin: fact("YV1SW61A712345678", { confidence: 0.3 }),
    };
    const result = selectNextQuestion({ category: "vehicles", facts });
    assert.ok(result);
    assert.equal(result!.field, "vin");
    assert.equal(result!.reason, "uncertain");
  });

  it("known mileage (confident) must not be asked again", () => {
    const facts: NextQuestionFacts = {
      make: fact("Škoda"),
      price: fact(7000),
      mileage: fact(120000),
    };
    const result = selectNextQuestion({ category: "vehicles", facts });
    assert.notEqual(result?.field, "mileage");
  });

  it("negative control — fully known vehicle draft asks nothing", () => {
    const facts: NextQuestionFacts = {
      make: fact("Ford"),
      model: fact("Focus"),
      price: fact(5000),
      mileage: fact(200000),
      year: fact(2016),
      techInspection: fact("2025-01"),
      transmission: fact("Mechaninė"),
      fuelType: fact("Benzinas"),
      vin: fact("WF0FXXGCDF1A23456", { confidence: 0.95 }),
    };
    assert.equal(selectNextQuestion({ category: "vehicles", facts }), null);
  });
});

describe("Phase 2B — Real Estate golden scenarios", () => {
  it("missing area is required and outranks non-required enrichment", () => {
    const facts: NextQuestionFacts = {
      propertyType: fact("Butas"),
      location: fact("Vilnius"),
    };
    const result = selectNextQuestion({ category: "real_estate", facts });
    assert.ok(result);
    assert.equal(result!.field, "area");
    assert.equal(result!.reason, "missing_required");
  });

  it("missing heating type is asked once required facts and price are known", () => {
    const facts: NextQuestionFacts = {
      propertyType: fact("Namas"),
      location: fact("Kaunas"),
      area: fact(120),
      price: fact(150000),
    };
    const result = selectNextQuestion({ category: "real_estate", facts });
    assert.ok(result);
    assert.equal(result!.field, "heatingType");
    assert.equal(result!.reason, "missing_important");
  });

  it("conflicting room count outranks price and heating", () => {
    const facts: NextQuestionFacts = {
      propertyType: fact("Butas"),
      location: fact("Klaipėda"),
      area: fact(60),
      rooms: fact(2, { conflict: true }),
    };
    const result = selectNextQuestion({ category: "real_estate", facts });
    assert.ok(result);
    assert.equal(result!.field, "rooms");
    assert.equal(result!.reason, "conflict");
  });

  it("known location is not re-asked; unknown location is required", () => {
    const known: NextQuestionFacts = {
      propertyType: fact("Butas"),
      area: fact(45),
      location: fact("Šiauliai"),
    };
    const unknown: NextQuestionFacts = {
      propertyType: fact("Butas"),
      area: fact(45),
    };
    assert.notEqual(
      selectNextQuestion({ category: "real_estate", facts: known })?.field,
      "location"
    );
    assert.equal(
      selectNextQuestion({ category: "real_estate", facts: unknown })?.field,
      "location"
    );
  });
});

describe("Phase 2B — Electronics golden scenarios", () => {
  it("missing exact model is asked (non-required, but highest remaining priority)", () => {
    const facts: NextQuestionFacts = {
      manufacturer: fact("Apple"),
      condition: fact("Naudotas"),
      price: fact(400),
    };
    const result = selectNextQuestion({ category: "electronics", facts });
    assert.ok(result);
    assert.equal(result!.field, "deviceModel");
  });

  it("missing storage/configuration asked after model is known", () => {
    const facts: NextQuestionFacts = {
      manufacturer: fact("Samsung"),
      condition: fact("Naujas"),
      price: fact(900),
      deviceModel: fact("Galaxy S24"),
    };
    const result = selectNextQuestion({ category: "electronics", facts });
    assert.ok(result);
    assert.equal(result!.field, "storage");
  });

  it("missing condition (required) outranks model/storage enrichment", () => {
    const facts: NextQuestionFacts = {
      manufacturer: fact("Apple"),
      price: fact(300),
    };
    const result = selectNextQuestion({ category: "electronics", facts });
    assert.ok(result);
    assert.equal(result!.field, "condition");
    assert.equal(result!.reason, "missing_required");
  });

  it("already-known model is not repeated", () => {
    const facts: NextQuestionFacts = {
      manufacturer: fact("Apple"),
      condition: fact("Naudotas"),
      price: fact(500),
      deviceModel: fact("iPhone 13"),
      storage: fact("128 GB"),
      warranty: fact("Nėra"),
    };
    assert.equal(selectNextQuestion({ category: "electronics", facts }), null);
  });
});

describe("Phase 2B — Fashion/Goods golden scenarios", () => {
  it("missing size is asked once condition and price are known", () => {
    const facts: NextQuestionFacts = { condition: fact("Gera"), price: fact(20) };
    const result = selectNextQuestion({ category: "clothing", facts });
    assert.ok(result);
    assert.equal(result!.field, "size");
  });

  it("missing condition is required and outranks size", () => {
    const result = selectNextQuestion({ category: "clothing", facts: {} });
    assert.ok(result);
    assert.equal(result!.field, "condition");
    assert.equal(result!.reason, "missing_required");
  });

  it("material/color rank lower than size (enrichment ordering)", () => {
    const order = debugPriorityOrder("clothing");
    const sizeIdx = order.indexOf("size");
    const materialIdx = order.indexOf("material");
    const colorIdx = order.indexOf("color");
    assert.ok(sizeIdx >= 0 && materialIdx > sizeIdx && colorIdx > materialIdx);
  });

  it("negative control — fully known clothing item asks nothing", () => {
    const facts: NextQuestionFacts = {
      condition: fact("Nauja su etiketėmis"),
      price: fact(25),
      size: fact("M"),
      material: fact("Medvilnė"),
      color: fact("Mėlyna"),
    };
    assert.equal(selectNextQuestion({ category: "clothing", facts }), null);
  });
});

describe("Phase 2B — Services golden scenarios", () => {
  it("missing service scope (serviceType) is required and asked first", () => {
    const result = selectNextQuestion({ category: "services", facts: {} });
    assert.ok(result);
    assert.equal(result!.field, "serviceType");
    assert.equal(result!.reason, "missing_required");
  });

  it("missing price model (pricingType) is required and outranks location/duration", () => {
    const facts: NextQuestionFacts = { serviceType: fact("Santechniko paslaugos") };
    const result = selectNextQuestion({ category: "services", facts });
    assert.ok(result);
    assert.equal(result!.field, "pricingType");
  });

  it("missing service area/location asked once scope + pricing are known", () => {
    const facts: NextQuestionFacts = {
      serviceType: fact("Kirpėjos paslaugos"),
      pricingType: fact("Fiksuota"),
    };
    const result = selectNextQuestion({ category: "services", facts });
    assert.ok(result);
    assert.equal(result!.field, "serviceLocation");
  });

  it("deadline/availability (duration) asked when it is the only remaining gap", () => {
    const facts: NextQuestionFacts = {
      serviceType: fact("Remonto paslaugos"),
      pricingType: fact("Valandinis"),
      serviceLocation: fact("Vilnius, nuotoliu"),
    };
    const result = selectNextQuestion({ category: "services", facts });
    assert.ok(result);
    assert.equal(result!.field, "duration");
  });
});

describe("Phase 2B — Jobs golden scenarios", () => {
  it("missing salary is asked once required fields are known", () => {
    const facts: NextQuestionFacts = {
      jobTitle: fact("Vairuotojas"),
      employmentType: fact("Pilnas etatas"),
      location: fact("Vilnius"),
    };
    const result = selectNextQuestion({ category: "jobs", facts });
    assert.ok(result);
    assert.equal(result!.field, "salaryMin");
  });

  it("missing employment type (required) outranks salary/location enrichment", () => {
    const facts: NextQuestionFacts = { jobTitle: fact("Pardavėjas") };
    const result = selectNextQuestion({ category: "jobs", facts });
    assert.ok(result);
    assert.equal(result!.field, "employmentType");
    assert.equal(result!.reason, "missing_required");
  });

  it("missing location/remote status: location(required) before workType(enrichment)", () => {
    const facts: NextQuestionFacts = {
      jobTitle: fact("Programuotojas"),
      employmentType: fact("Pilnas etatas"),
    };
    const result = selectNextQuestion({ category: "jobs", facts });
    assert.ok(result);
    assert.equal(result!.field, "location");
    assert.equal(result!.reason, "missing_required");
  });

  it("conflicting working conditions (workType) outrank salary enrichment", () => {
    const facts: NextQuestionFacts = {
      jobTitle: fact("Buhalteris"),
      employmentType: fact("Pilnas etatas"),
      location: fact("Kaunas"),
      salaryMin: fact(1500),
      workType: fact("Nuotoliu", { conflict: true }),
    };
    const result = selectNextQuestion({ category: "jobs", facts });
    assert.ok(result);
    assert.equal(result!.field, "workType");
    assert.equal(result!.reason, "conflict");
  });
});

describe("Phase 2B — universal publish blockers (sellerType, city)", () => {
  it("city missing + optional enrichment missing → asks one city question", () => {
    const facts: NextQuestionFacts = {
      make: fact("Toyota"),
      model: fact("Corolla"),
      price: fact(8000),
      mileage: fact(140000),
      year: fact(2015),
    };
    const result = selectNextQuestion({
      category: "vehicles",
      facts,
      blockers: { sellerType: fact("private"), city: fact(undefined) },
    });
    assert.ok(result);
    assert.equal(result!.field, "city");
    assert.equal(result!.reason, "missing_blocker");
    assert.match(result!.question, /miestą/i);
  });

  it("sellerType missing + optional enrichment missing → sellerType wins", () => {
    const facts: NextQuestionFacts = {
      make: fact("Toyota"),
      model: fact("Corolla"),
      price: fact(8000),
      mileage: fact(140000),
    };
    const result = selectNextQuestion({
      category: "vehicles",
      facts,
      blockers: { sellerType: fact(undefined), city: fact("Vilnius") },
    });
    assert.ok(result);
    assert.equal(result!.field, "sellerType");
    assert.equal(result!.reason, "missing_blocker");
  });

  it("vertical required field and city both missing → the documented deterministic winner (required) is selected", () => {
    const result = selectNextQuestion({
      category: "vehicles",
      facts: {},
      blockers: { sellerType: fact("private"), city: fact(undefined) },
    });
    assert.ok(result);
    assert.equal(result!.field, "make");
    assert.equal(result!.reason, "missing_required");
  });

  it("core-important vehicle model still outranks blockers (documented Transport ordering)", () => {
    const result = selectNextQuestion({
      category: "vehicles",
      facts: { make: fact("Toyota") },
      blockers: { sellerType: fact(undefined), city: fact(undefined) },
    });
    assert.ok(result);
    assert.equal(result!.field, "model");
  });

  it("after answering the blocker, the next highest-value fact is selected", () => {
    const facts: NextQuestionFacts = {
      make: fact("Toyota"),
      model: fact("Corolla"),
    };
    const blockers = { sellerType: fact(undefined), city: fact("Vilnius") };
    const first = selectNextQuestion({ category: "vehicles", facts, blockers });
    assert.equal(first?.field, "sellerType");

    const resolvedBlockers = { sellerType: fact("private"), city: fact("Vilnius") };
    const second = selectNextQuestion({ category: "vehicles", facts, blockers: resolvedBlockers });
    assert.equal(second?.field, "price");
  });

  it("no field is repeatedly asked after its answer is applied (blockers included in the loop)", () => {
    let facts: NextQuestionFacts = {};
    let blockers = { sellerType: fact(undefined), city: fact(undefined) };
    const askedFields: string[] = [];
    for (let turn = 0; turn < 12; turn++) {
      const result = selectNextQuestion({ category: "vehicles", facts, blockers });
      if (!result) break;
      askedFields.push(result.field);
      if (result.field === "sellerType" || result.field === "city") {
        blockers = { ...blockers, [result.field]: fact("answered") };
      } else {
        facts = { ...facts, [result.field]: fact("answered") };
      }
    }
    assert.equal(new Set(askedFields).size, askedFields.length);
    assert.ok(askedFields.length < 12);
    assert.equal(selectNextQuestion({ category: "vehicles", facts, blockers }), null);
  });

  it("a low-value optional fact (transmission) never outranks a genuinely publish-blocking missing fact", () => {
    const facts: NextQuestionFacts = {
      make: fact("Toyota"),
      model: fact("Corolla"),
      price: fact(8000),
      mileage: fact(140000),
      year: fact(2015),
      // transmission / techInspection / fuelType deliberately left missing (low-value enrichment).
    };
    const result = selectNextQuestion({
      category: "vehicles",
      facts,
      blockers: { sellerType: fact(undefined), city: fact("Vilnius") },
    });
    assert.ok(result);
    assert.equal(result!.field, "sellerType");
    assert.notEqual(result!.field, "transmission");
  });

  it("blockers are omitted entirely (no key in `blockers`) → never asked, never crash", () => {
    const result = selectNextQuestion({
      category: "vehicles",
      facts: { make: fact("Toyota"), model: fact("Corolla"), price: fact(8000), mileage: fact(140000) },
    });
    assert.notEqual(result?.field, "sellerType");
    assert.notEqual(result?.field, "city");
  });
});

describe("Phase 2B — cross-cutting behaviors", () => {
  it("multiple missing fields still yield exactly one question", () => {
    const result = selectNextQuestion({ category: "vehicles", facts: {} });
    assert.ok(result);
    assert.equal(typeof result!.field, "string");
    // Structural guarantee: the result is a single object, never an array.
    assert.equal(Array.isArray(result), false);
  });

  it("conflict outranks ordinary missing enrichment across verticals", () => {
    const facts: NextQuestionFacts = {
      make: fact("BMW"),
      price: fact(1),
      mileage: fact(50000, { conflict: true }),
    };
    const result = selectNextQuestion({ category: "vehicles", facts });
    assert.equal(result!.field, "mileage");
    assert.equal(result!.reason, "conflict");
  });

  it("answering the question advances to the next highest-value fact (no repeat loop)", () => {
    let facts: NextQuestionFacts = { make: fact("Kia") };
    const askedFields: string[] = [];
    for (let turn = 0; turn < 10; turn++) {
      const result = selectNextQuestion({ category: "vehicles", facts });
      if (!result) break;
      askedFields.push(result.field);
      // Simulate the user answering — the field becomes known with full confidence.
      facts = { ...facts, [result.field]: fact("answered") };
    }
    // No field is ever asked twice.
    assert.equal(new Set(askedFields).size, askedFields.length);
    // Eventually terminates (no infinite loop).
    assert.ok(askedFields.length < 10);
    // Final state has nothing left to ask.
    assert.equal(selectNextQuestion({ category: "vehicles", facts }), null);
  });

  it("intent pivot (vertical change) recomputes priority from the new state", () => {
    const asVehicle = selectNextQuestion({
      category: "vehicles",
      facts: { make: fact("BMW"), price: fact(1000) },
    });
    const asRealEstateSameFacts = selectNextQuestion({
      category: "real_estate",
      // Same underlying attribute bag pivoted to a different vertical — priorities differ.
      facts: { make: fact("BMW"), price: fact(1000) },
    });
    assert.notEqual(asVehicle?.field, asRealEstateSameFacts?.field);
    assert.equal(asRealEstateSameFacts?.field, "propertyType");
  });

  it("irrelevant/noisy facts (unknown keys) never create extra questions", () => {
    const facts: NextQuestionFacts = {
      make: fact("Audi"),
      model: fact("A4"),
      price: fact(2000),
      mileage: fact(90000),
      year: fact(2018),
      techInspection: fact("2027-01"),
      transmission: fact("Automatinė"),
      fuelType: fact("Elektra"),
      vin: fact("WAUZZZ8V8KA000000", { confidence: 0.95 }),
      totallyUnrelatedNoiseField: fact("blah blah"),
      __proto__unsafe: fact("ignored"),
    };
    assert.equal(selectNextQuestion({ category: "vehicles", facts }), null);
  });

  it("no missing important fact → zero follow-up questions (fully satisfied draft)", () => {
    const facts: NextQuestionFacts = {
      serviceType: fact("Valymo paslaugos"),
      pricingType: fact("Sutartinis"),
      serviceLocation: fact("Visa Lietuva"),
      duration: fact("Per 3 dienas"),
      price: fact(50),
    };
    assert.equal(selectNextQuestion({ category: "services", facts }), null);
  });

  it("uncertain extraction never becomes a trusted fact for missing-tier purposes", () => {
    // A low-confidence VIN does not count as "known" for the required/important tiers —
    // it is surfaced via the dedicated uncertain tier instead of silently accepted.
    const facts: NextQuestionFacts = {
      make: fact("Peugeot"),
      price: fact(4000),
      mileage: fact(60000),
      techInspection: fact("2026-01"),
      transmission: fact("Mechaninė"),
      fuelType: fact("Dyzelinas"),
      vin: fact("VF3XXXXXXXXXXXXX", { confidence: 0.2 }),
    };
    const result = selectNextQuestion({ category: "vehicles", facts });
    assert.equal(result!.field, "vin");
    assert.equal(result!.reason, "uncertain");
  });

  it("determinism — identical input always yields identical output", () => {
    const facts: NextQuestionFacts = {
      manufacturer: fact("Sony"),
      price: fact(150),
    };
    const first = selectNextQuestion({ category: "electronics", facts });
    const second = selectNextQuestion({ category: "electronics", facts });
    assert.deepEqual(first, second);
  });

  it("structural assertion is independent of localized question text", () => {
    const facts: NextQuestionFacts = { make: fact("Renault"), model: fact("Clio") };
    const result = selectNextQuestion({ category: "vehicles", facts });
    // Field/reason are asserted structurally; the Lithuanian text is asserted separately.
    assert.equal(result!.field, "price");
    assert.equal(result!.reason, "missing_required");
    assert.equal(typeof result!.question, "string");
    assert.ok(result!.question.length > 0);
  });
});

describe("F5 - home / HOME_GARDEN single-question parity", () => {
  it("empty home draft asks itemType first (canonical required tier)", () => {
    const result = selectNextQuestion({
      category: "home",
      facts: {},
      blockers: { sellerType: fact(undefined), city: fact(undefined) },
    });
    assert.ok(result);
    assert.equal(result!.field, "itemType");
    assert.equal(result!.reason, "missing_required");
  });

  it("itemType known -> condition next", () => {
    const result = selectNextQuestion({
      category: "home",
      facts: { itemType: fact("Baldai") },
      blockers: { sellerType: fact(undefined), city: fact(undefined) },
    });
    assert.ok(result);
    assert.equal(result!.field, "condition");
    assert.equal(result!.reason, "missing_required");
  });

  it("required fields outrank universal blockers and price", () => {
    const result = selectNextQuestion({
      category: "home",
      facts: {},
      blockers: { sellerType: fact(undefined), city: fact(undefined) },
    });
    assert.ok(result);
    assert.equal(result!.field, "itemType");
    assert.notEqual(result!.field, "sellerType");
    assert.notEqual(result!.field, "price");
  });

  it("optional material/deliveryOption are asked only after required + blockers + price", () => {
    const filled = {
      itemType: fact("Sodo technika"),
      condition: fact("Naudota"),
      price: fact(120),
    };
    const withBlockersMissing = selectNextQuestion({
      category: "home",
      facts: filled,
      blockers: { sellerType: fact(undefined), city: fact(undefined) },
    });
    assert.ok(withBlockersMissing);
    assert.equal(withBlockersMissing!.field, "sellerType", "blocker before optional");

    const everythingElse = selectNextQuestion({
      category: "home",
      facts: filled,
      blockers: { sellerType: fact("private"), city: fact("Vilnius") },
    });
    assert.ok(everythingElse);
    assert.equal(everythingElse!.field, "material", "first optional after all other tiers");
    assert.equal(everythingElse!.reason, "missing_important");

    const materialKnown = selectNextQuestion({
      category: "home",
      facts: { ...filled, material: fact("Metalas") },
      blockers: { sellerType: fact("private"), city: fact("Vilnius") },
    });
    assert.ok(materialKnown);
    assert.equal(materialKnown!.field, "deliveryOption", "second optional");
  });

  it("exactly one question per turn (single structural result)", () => {
    const result = selectNextQuestion({
      category: "home",
      facts: {},
      blockers: { sellerType: fact(undefined), city: fact(undefined) },
    });
    assert.ok(result);
    assert.equal(typeof result!.field, "string");
    assert.equal(typeof result!.question, "string");
    // The API returns one object or null - never a list.
    assert.ok(!Array.isArray(result));
  });

  it("uses only canonical HOME_GARDEN keys; furnitureType never appears", () => {
    const order = debugPriorityOrder("home");
    for (const key of order) {
      assert.ok(
        ["itemType", "condition", "material", "deliveryOption", "sellerType", "city", "price"].includes(key),
        `canonical key only, got: ${key}`
      );
      assert.notEqual(key, "furnitureType");
    }
    const q1 = selectNextQuestion({ category: "home", facts: {}, blockers: { sellerType: fact("private"), city: fact("Vilnius") } });
    assert.ok(q1 && !q1.question.toLowerCase().includes("furnituretype"));
    const q2 = selectNextQuestion({
      category: "home",
      facts: { itemType: fact("Baldai"), condition: fact("Nauja"), price: fact(50), material: fact("Medis") },
      blockers: { sellerType: fact("private"), city: fact("Vilnius") },
    });
    assert.ok(q2 && q2.field === "deliveryOption");
    assert.match(q2.question, /siuntimas|atsiėmimas|abu/i);
  });

  it("clothing and the other six vertical priorities are unchanged", () => {
    const snapshots: Record<string, string[]> = {
      clothing: debugPriorityOrder("clothing"),
      vehicles: debugPriorityOrder("vehicles"),
      real_estate: debugPriorityOrder("real_estate"),
      electronics: debugPriorityOrder("electronics"),
      services: debugPriorityOrder("services"),
      jobs: debugPriorityOrder("jobs"),
    };
    assert.deepEqual(snapshots.clothing.slice(0, 3), ["condition", "sellerType", "city"]);
    assert.deepEqual(snapshots.vehicles.slice(0, 3), ["vin", "make", "model"]);
    assert.deepEqual(snapshots.real_estate.slice(0, 1), ["propertyType"]);
    assert.deepEqual(snapshots.electronics.slice(0, 1), ["manufacturer"]);
    assert.deepEqual(snapshots.services.slice(0, 1), ["serviceType"]);
    assert.deepEqual(snapshots.jobs.slice(0, 2), ["jobTitle", "employmentType"]);
    for (const [cat, order] of Object.entries(snapshots)) {
      assert.ok(!order.includes("furnitureType"), `${cat} must not know furnitureType`);
      assert.ok(!order.includes("itemType") || cat === "home", `${cat} must not use home keys`);
    }
  });
});
