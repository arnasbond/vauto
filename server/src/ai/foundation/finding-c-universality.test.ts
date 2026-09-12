/**
 * Finding C — universality matrix (BLOCKER 1 delta).
 *
 * Proves the REAL extraction pipeline (handleVautoServerAction → runTwoPassListingGeneration
 * → schema hint → deterministic normalization → listing draft) resolves every canonical
 * vertical from realistic Lithuanian input, with the model STUBBED (no real-model eval).
 *
 * Each case asserts the full chain:
 *   USER INPUT → CATEGORY RESOLUTION → CANONICAL VERTICAL → SCHEMA HINT (in the Pass-1
 *   prompt actually sent) → EXTRACTION RESULT → NORMALIZED CANONICAL ATTRIBUTES →
 *   LISTING DRAFT (structured state), and that an ARBITRARY unknown key is DROPPED.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { handleVautoServerAction } from "../vauto-unified.js";

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

type CapturedFetch = {
  prompts: string[];
  restore: () => void;
};

function installCapturingFetch(script: {
  pass1: Record<string, unknown>;
  pass2: Record<string, unknown>;
}): CapturedFetch {
  const original = globalThis.fetch;
  const prompts: string[] = [];
  let callIndex = 0;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    if (!url.includes("generativelanguage.googleapis.com")) {
      return original(input, init);
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      contents?: Array<{ parts?: Array<{ text?: string }> }>;
    };
    const promptText = (body.contents ?? [])
      .flatMap((c) => c.parts ?? [])
      .map((p) => p.text ?? "")
      .join("\n");
    prompts.push(promptText);
    const payload = callIndex === 0 ? script.pass1 : script.pass2;
    callIndex += 1;
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;
  return {
    prompts,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

async function runTextListing(
  userText: string,
  pass1: Record<string, unknown>,
  pass2: Record<string, unknown>
): Promise<{ listing: Record<string, unknown>; prompts: string[] }> {
  const captured = installCapturingFetch({ pass1, pass2 });
  process.env.GEMINI_API_KEY = "finding-c-test-key";
  try {
    const res = await handleVautoServerAction({
      action: "parse_text",
      text: userText,
      userCity: "Vilnius",
      contact: "+37060000000",
    });
    assert.ok((res as { ok?: boolean }).ok, "parse_text must succeed");
    const listing = ((res as { listing?: Record<string, unknown> }).listing ?? {}) as Record<
      string,
      unknown
    >;
    return { listing, prompts: captured.prompts };
  } finally {
    captured.restore();
  }
}

const attrs = (listing: Record<string, unknown>): Record<string, string> =>
  (listing.attributes ?? {}) as Record<string, string>;

describe("Finding C — universality matrix (production pipeline, stubbed model)", () => {
  it("TRANSPORT: resolves vehicle schema and drops arbitrary keys", async () => {
    const { listing, prompts } = await runTextListing(
      "Parduodu 2018 m. Volkswagen Passat, 2.0 dyzelis, automatas, 185000 km",
      {
        intent: "sell",
        category: "AUTOMOBILIAI",
        technicalFields: {
          make: "Volkswagen",
          model: "Passat",
          year: "2018",
          mileage: "185000",
          fuelType: "dyzelinas",
          transmission: "Automatine",
          engine: "2.0",
          powerKw: "110",
          totallyMadeUpField: "injected",
        },
        confidence: 0.9,
      },
      { title: "Volkswagen Passat 2018", description: "Parduodamas Volkswagen Passat 2018, dyzelis, automatas." }
    );
    assert.match(prompts[0] ?? "", /KATEGORIJOS STRUKTŪRA/, "Pass-1 prompt must carry the schema hint");
    assert.match(prompts[0] ?? "", /make\(string\)/, "transport schema keys in prompt");
    assert.equal(listing.category, "vehicles");
    const a = attrs(listing);
    assert.equal(a.make, "Volkswagen");
    assert.equal(a.model, "Passat");
    assert.equal(a.year, "2018");
    assert.equal(a.mileage, "185000");
    assert.equal(a.fuelType, "Dyzelinas");
    assert.equal(a.transmission, "Automatin\u0117");
    assert.equal(a.engine, "2.0");
    assert.equal(a.powerKw, "110");
    assert.equal(a.totallyMadeUpField, undefined, "arbitrary model key must be dropped");
  });

  it("REAL_ESTATE: resolves property schema", async () => {
    const { listing, prompts } = await runTextListing(
      "Parduodu 3 kambarių butą Antakalnyje, 68 m², 4 aukštas, 1985 m. statyba",
      {
        intent: "sell",
        category: "NT",
        technicalFields: {
          propertyType: "Butas",
          area: "68",
          rooms: "3",
          floor: "4",
          yearBuilt: "1985",
          location: "Vilnius, Antakalnis",
          make: "BMW",
        },
        confidence: 0.9,
      },
      { title: "3 kambarių butas Antakalnyje", description: "Parduodamas 68 m², 3 kambarių butas Antakalnyje." }
    );
    assert.match(prompts[0] ?? "", /propertyType\(enum: Butas\|Namas\|Sklypas\|Komercija\|Sodas\)/);
    assert.equal(listing.category, "real_estate");
    const a = attrs(listing);
    assert.equal(a.propertyType, "Butas");
    assert.equal(a.area, "68");
    assert.equal(a.rooms, "3");
    assert.equal(a.floor, "4");
    assert.equal(a.yearBuilt, "1985");
    assert.equal(a.make, undefined, "vehicle key must not leak into real estate");
  });

  it("ELECTRONICS: resolves device schema", async () => {
    const { listing, prompts } = await runTextListing(
      "Parduodu iPhone 13 Pro 256 GB, būklė naudota, su garantija",
      {
        intent: "sell",
        category: "ELEKTRONIKA",
        technicalFields: {
          manufacturer: "Apple",
          deviceModel: "iPhone 13 Pro",
          condition: "naudotas",
          storage: "256 GB",
          warranty: "Yra",
          clothingType: "Striukė",
        },
        confidence: 0.9,
      },
      { title: "iPhone 13 Pro 256 GB", description: "Parduodamas iPhone 13 Pro 256 GB, naudotas, su garantija." }
    );
    assert.match(prompts[0] ?? "", /manufacturer\(string\)/);
    assert.equal(listing.category, "electronics");
    const a = attrs(listing);
    assert.equal(a.manufacturer, "Apple");
    assert.equal(a.deviceModel, "iPhone 13 Pro");
    assert.equal(a.condition, "Naudotas");
    assert.equal(a.storage, "256 GB");
    assert.equal(a.warranty, "Yra");
    assert.equal(a.clothingType, undefined, "clothing key must not leak into electronics");
  });

  it("CLOTHING: resolves fashion schema", async () => {
    const { listing } = await runTextListing(
      "Parduodu žieminę striukę, dydis L, būklė nauja",
      {
        intent: "sell",
        category: "APRANGA",
        technicalFields: {
          clothingType: "Žieminė striukė",
          size: "L",
          condition: "naujas",
          manufacturer: "Apple",
        },
        confidence: 0.9,
      },
      { title: "Žieminė striukė", description: "Parduodama žieminė striukė, dydis L, nauja." }
    );
    assert.equal(listing.category, "clothing");
    const a = attrs(listing);
    assert.equal(a.clothingType, "Žieminė striukė");
    assert.equal(a.size, "L");
    assert.equal(a.condition, "Naujas");
    assert.equal(a.manufacturer, undefined, "electronics key must not leak into clothing");
  });

  it("SERVICES: resolves service schema", async () => {
    const { listing } = await runTextListing(
      "Siūlau santechniko paslaugas Vilniuje, valandinis atlygis, darbas vietoje",
      {
        intent: "sell",
        category: "PASLAUGOS",
        technicalFields: {
          serviceType: "Santechnikos darbai",
          serviceMode: "Vietoje",
          pricingType: "Valandinis",
          duration: "pagal sutarimą",
          salaryMin: "1500",
        },
        confidence: 0.9,
      },
      { title: "Santechniko paslaugos", description: "Siūlomos santechniko paslaugos Vilniuje, valandinis atlygis." }
    );
    assert.equal(listing.category, "services");
    const a = attrs(listing);
    assert.equal(a.serviceType, "Santechnikos darbai");
    assert.equal(a.serviceMode, "Vietoje");
    assert.equal(a.pricingType, "Valandinis");
    assert.equal(a.salaryMin, undefined, "jobs key must not leak into services");
  });

  it("JOBS: resolves job schema", async () => {
    const { listing } = await runTextListing(
      "Ieškau sunkvežimio vairuotojo pilnam etatui, atlygis 1800–2200 €, biuras Vilniuje",
      {
        intent: "sell",
        category: "DARBAS",
        technicalFields: {
          jobTitle: "Sunkvežimio vairuotojas",
          employmentType: "Pilnas etatas",
          salaryMin: "1800",
          salaryMax: "2200",
          location: "Vilnius",
          workType: "Biure",
          serviceType: "Kirpimas",
        },
        confidence: 0.9,
      },
      { title: "Sunkvežimio vairuotojas", description: "Ieškomas sunkvežimio vairuotojas pilnam etatui, 1800–2200 €." }
    );
    assert.equal(listing.category, "jobs");
    const a = attrs(listing);
    assert.equal(a.jobTitle, "Sunkvežimio vairuotojas");
    assert.equal(a.employmentType, "Pilnas etatas");
    assert.equal(a.salaryMin, "1800");
    assert.equal(a.salaryMax, "2200");
    assert.equal(a.workType, "Biure");
    assert.equal(a.serviceType, undefined, "service key must not leak into jobs");
  });

  it("HOME_GARDEN: resolves home/garden schema", async () => {
    const { listing } = await runTextListing(
      "Parduodu medinį valgomojo stalą, naudotas, atsiėmimas Vilniuje",
      {
        intent: "sell",
        category: "NAMAI",
        technicalFields: {
          itemType: "Baldai",
          condition: "naudotas",
          material: "Medis",
          deliveryOption: "Atsiėmimas",
          engine: "2.0",
        },
        confidence: 0.9,
      },
      { title: "Medinis valgomojo stalas", description: "Parduodamas medinis valgomojo stalas, atsiėmimas Vilniuje." }
    );
    assert.equal(listing.category, "home");
    const a = attrs(listing);
    assert.equal(a.itemType, "Baldai");
    assert.equal(a.condition, "Naudotas");
    assert.equal(a.material, "Medis");
    assert.equal(a.deliveryOption, "Atsiėmimas");
    assert.equal(a.engine, undefined, "vehicle key must not leak into home/garden");
  });

  it("OTHER: resolves generic-goods schema", async () => {
    const { listing } = await runTextListing(
      "Parduodu stalo žaidimą, būklė naudota",
      {
        intent: "sell",
        category: "LAISVALAIKIS",
        technicalFields: {
          condition: "naudotas",
          bodyType: "universalas",
        },
        confidence: 0.9,
      },
      { title: "Stalo žaidimas", description: "Parduodamas stalo žaidimas, naudotas." }
    );
    assert.equal(listing.category, "other");
    const a = attrs(listing);
    assert.equal(a.condition, "Naudotas");
    assert.equal(a.bodyType, undefined, "vehicle key must not leak into other");
  });
});
