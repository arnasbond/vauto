/**
 * P0 — REAL server 8-category fact matrix through `runVautoAgent`.
 *
 * The model layer is stubbed to return an EMPTY response (Gemini contributes
 * NOTHING — the AI-down scenario), so every fact in the resulting draft is
 * extracted by the SERVER itself from the raw user sentence (deterministic
 * fresh-create fallback). The test injects NO expected draft — it asserts the
 * actual server-formed title/category/price/city/condition and the honesty of
 * the reply (no price-update intro, no generic title, no publish chip).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { runVautoAgent } from "../../vauto-agent.js";
import type { VautoAgentRequest } from "../../vauto-agent.js";
import { isGenericListingDraftTitle } from "../../../shared/listing-organism.js";

const originalFetch = globalThis.fetch;

function installEmptyModelStub() {
  process.env.GEMINI_API_KEY = "p0-test-fake-key";
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    if (url.includes("generativelanguage.googleapis.com")) {
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [] } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return originalFetch(input, init);
  }) as typeof fetch;
}

before(() => {
  installEmptyModelStub();
});

after(() => {
  globalThis.fetch = originalFetch;
  delete process.env.GEMINI_API_KEY;
});

function requestFor(userText: string): VautoAgentRequest {
  return {
    messages: [{ role: "user", text: userText }],
    context: {
      userCity: "",
      contact: "+37060000000",
      profilePhone: "+37060000000",
      isAuthenticated: true,
      // The forged generic seed must never be treated as an existing draft:
      listingDraft: {
        title: "Naujas skelbimas",
        description: "",
        price: 0,
        location: "",
        category: "other",
        listingFlowState: "DRAFT_READY" as const,
        attributes: {},
      },
      freshListingSession: true,
      omitPriorListingDraft: true,
    },
  };
}

function draftOf(response: Awaited<ReturnType<typeof runVautoAgent>>) {
  assert.equal(
    response.actions.type,
    "listing_draft",
    `expected a listing_draft action, got ${response.actions.type} (reply: ${response.reply})`
  );
  return (response.actions as { listingDraft: { title?: string; category?: string; price?: number; location?: string; attributes?: Record<string, string> } })
    .listingDraft;
}

const MATRIX: Array<{
  category: string;
  text: string;
  expectedCategory: string;
  expectedPrice: number;
  expectedCity: string;
  /** Exact canonical title the server must synthesize from the text. */
  expectedTitle: string;
  /** Deterministic category facts the text states — asserted exactly. */
  expectedAttributes: Record<string, string>;
  /** Attribute KEYS the deterministic AI-down engine cannot reasonably
   *  extract from this text — asserted ABSENT, never silently claimed. */
  documentedMissing: string[];
}> = [
  {
    category: "Elektronika (Atlas reprodukcija)",
    text: "Parduodu naudotą juodą iPhone 15 Pro 256 GB, Kaune, kaina 850 eurų",
    expectedCategory: "electronics",
    expectedPrice: 850,
    expectedCity: "Kaunas",
    expectedTitle: "iPhone 15 Pro 256 GB",
    expectedAttributes: {
      deviceModel: "iPhone 15 Pro",
      storage: "256 GB",
      color: "Juoda",
      condition: "Naudota",
    },
    documentedMissing: [],
  },
  {
    category: "Mada (Atlas reprodukcija)",
    text: "Parduodu naują juodą moterišką odinę striukę, M dydžio, Vilniuje, už 120 eurų",
    expectedCategory: "clothing",
    expectedPrice: 120,
    expectedCity: "Vilnius",
    expectedTitle: "Moteriška odinė striukė",
    expectedAttributes: {
      clothingType: "Striukės",
      size: "M",
      color: "Juoda",
      condition: "Nauja",
    },
    documentedMissing: [],
  },
  {
    category: "Transportas",
    text: "Parduodu naudotą juodą BMW 320d 2015 m., Kaune, kaina 9500 eurų",
    expectedCategory: "vehicles",
    expectedPrice: 9500,
    expectedCity: "Kaunas",
    expectedTitle: "BMW 320d 2015",
    expectedAttributes: {
      make: "BMW",
      model: "320d",
      year: "2015",
      condition: "Naudota",
    },
    documentedMissing: ["mileage", "fuelType", "transmission"],
  },
  {
    category: "Nekilnojamas turtas",
    text: "Parduodu 3 kambarių butą Vilniuje, kaina 85000 eurų",
    expectedCategory: "real_estate",
    expectedPrice: 85000,
    expectedCity: "Vilnius",
    expectedTitle: "3 kambarių butas",
    expectedAttributes: { rooms: "3", propertyType: "Butas" },
    // NT kategorijai būklė neprivaloma; tekste jos nėra.
    documentedMissing: [],
  },
  {
    category: "Namai ir buitis",
    text: "Parduodu naudotą ąžuolinį valgomojo stalą, Vilniuje, kaina 200 eurų",
    expectedCategory: "home",
    expectedPrice: 200,
    expectedCity: "Vilnius",
    expectedTitle: "Ąžuolinis valgomojo stalas",
    expectedAttributes: { material: "Ąžuolas", condition: "Naudota" },
    documentedMissing: [],
  },
  {
    category: "Paslaugos",
    text: "Parduodu paslaugą — buto valymas Vilniuje, 40 eurų per valandą",
    expectedCategory: "services",
    expectedPrice: 40,
    expectedCity: "Vilnius",
    expectedTitle: "Buto valymas",
    expectedAttributes: { serviceType: "Valymas" },
    // Paslaugoms būklė neprivaloma; tekste jos nėra.
    documentedMissing: [],
  },
  {
    category: "Darbas",
    text: "Siūlau darbą pardavėju Vilniuje, atlyginimas 1200 eurų",
    expectedCategory: "jobs",
    expectedPrice: 1200,
    expectedCity: "Vilnius",
    expectedTitle: "Pardavėjas",
    expectedAttributes: { jobTitle: "Pardavėjas", salaryMin: "1200" },
    // Tekste workType neminimas — privalo likti MISSING.
    documentedMissing: ["workType"],
  },
  {
    category: "Kita",
    text: "Parduodu naudotą vaikišką dviratuką, Kaune, kaina 80 eurų",
    expectedCategory: "other",
    expectedPrice: 80,
    expectedCity: "Kaunas",
    expectedTitle: "Vaikiškas dviratukas",
    expectedAttributes: { condition: "Naudota" },
    documentedMissing: [],
  },
];

describe("P0 — real server fresh-create fact matrix (8 categories, full natural sentences)", () => {
  for (const row of MATRIX) {
    it(`${row.category}: serveris pats suformuoja draftą — tikslus title, category, kaina, miestas, būklė ir atributai`, async () => {
      const response = await runVautoAgent(requestFor(row.text));
      const draft = draftOf(response);

      // Exact canonical title — short object name, never the generic seed:
      assert.equal(draft.title, row.expectedTitle);
      assert.equal(isGenericListingDraftTitle(draft.title), false);
      // The title carries no price/currency/city/sell-verb/condition fillers:
      assert.doesNotMatch(
        String(draft.title ?? ""),
        /eur|€|parduod|siūlau|nauj|naudot|kaun|vilniu/i
      );

      // Category, price and city from the text:
      assert.equal(draft.category, row.expectedCategory);
      assert.equal(draft.price, row.expectedPrice);
      assert.equal(draft.location, row.expectedCity);

      // Category attributes the text states — asserted exactly:
      for (const [key, value] of Object.entries(row.expectedAttributes)) {
        assert.equal(
          draft.attributes?.[key],
          value,
          `${row.category}: attributes.${key} should equal ${value}`
        );
      }
      // Facts the deterministic engine cannot extract are MISSING, not faked:
      for (const key of row.documentedMissing) {
        assert.equal(
          draft.attributes?.[key],
          undefined,
          `${row.category}: attributes.${key} must stay MISSING (never invented)`
        );
      }

      // Honest reply: never a price-update intro, never the generic seed,
      // never a „pilną“ claim without canonical readiness, never a publish chip:
      assert.doesNotMatch(response.reply, /atnaujinau kainą/i);
      assert.doesNotMatch(response.reply, /Naujas skelbimas/i);
      assert.doesNotMatch(response.reply, /Paruošiau pilną/i);
      const replies = response.quickReplies ?? [];
      assert.equal(replies.some((r) => String(r).includes("Publikuoti")), false);
    });
  }

  it("no generic seed survives the fresh-create path (no draft injected)", async () => {
    const response = await runVautoAgent(requestFor(MATRIX[0]!.text));
    const draft = draftOf(response);
    assert.doesNotMatch(String(draft.title ?? ""), /naujas skelbimas/i);
    assert.doesNotMatch(response.reply, /atnaujinau kainą/i);
  });
});

describe("P0 — title price/currency stripping (no ASCII-\\b word boundaries)", () => {
  const cases: Array<{ text: string; category: string }> = [
    { text: "Parduodu juodą telefoną, Kaune, už 120 eurų", category: "electronics" },
    { text: "Parduodu juodą telefoną, Kaune, už 120 €", category: "electronics" },
    { text: "Parduodu juodą telefoną, Kaune, kaina 850 eurų", category: "electronics" },
    { text: "Parduodu juodą telefoną, Kaune, 40 eurų per valandą", category: "electronics" },
    { text: "Siūlau darbą kasininku, atlyginimas 1200 eurų", category: "jobs" },
  ];
  for (const c of cases) {
    it(`„${c.text.slice(0, 48)}…“ — title be kainos/valiutos`, async () => {
      const response = await runVautoAgent(requestFor(c.text));
      const draft = draftOf(response);
      assert.doesNotMatch(String(draft.title ?? ""), /eur|€|atlyginimas|kaina|už/i);
      assert.equal(isGenericListingDraftTitle(draft.title), false);
    });
  }
});

describe("P0 — prekių ženklų ir modelių tokenų apsauga (žmogaus tekstas = autoritetas)", () => {
  const BRAND_CASES: Array<{ text: string; tokens: string[] }> = [
    { text: "Parduodu New Balance 574 batus, Vilniuje, kaina 120 eurų", tokens: ["new balance 574"] },
    { text: "Parduodu Samsung Galaxy S24 Ultra telefoną, kaina 900 eurų", tokens: ["samsung", "galaxy", "s24", "ultra"] },
    { text: "Parduodu Samsung Galaxy S 24 telefoną", tokens: ["samsung", "galaxy", "s", "24"] },
    { text: "Parduodu Tesla Model S automobilį", tokens: ["tesla", "model s"] },
    { text: "Parduodu BMW M3 automobilį", tokens: ["bmw", "m3"] },
    { text: "Parduodu H&M suknelę, Vilniuje", tokens: ["h&m", "suknelė"] },
    { text: "Parduodu Nike Air Max 90 batus", tokens: ["nike", "air", "max", "90"] },
    { text: "Parduodu Sony WH-1000XM5 ausines", tokens: ["sony", "wh-1000xm5"] },
    { text: "Parduodu PlayStation 5 Slim konsolę", tokens: ["playstation", "5", "slim"] },
    { text: "Parduodu DJI Mini 4 Pro droną", tokens: ["dji", "mini", "4", "pro"] },
    { text: "Parduodu Makita DDF484 grąžtą", tokens: ["makita", "ddf484"] },
    { text: "Parduodu LEGO Technic 42171 konstruktorių", tokens: ["lego", "technic", "42171"] },
    { text: "Parduodu USB-C Hub adapterį", tokens: ["usb-c", "hub"] },
    { text: "Parduodu iPad Pro M4 planšetę", tokens: ["ipad", "pro", "m4"] },
  ];
  for (const c of BRAND_CASES) {
    it(`${c.text.slice(0, 44)}… — visi ženklo/modelio tokenai išlieka title`, async () => {
      const response = await runVautoAgent(requestFor(c.text));
      const draft = draftOf(response);
      const titleLower = String(draft.title ?? "").toLowerCase();
      for (const token of c.tokens) {
        assert.ok(
          titleLower.includes(token.toLowerCase()),
          `title „${draft.title}“ must preserve token „${token}“`
        );
      }
      assert.equal(isGenericListingDraftTitle(draft.title), false);
    });
  }

  it("modelio numeriai NĖRA kainos: WH-1000XM5 / DDF484 / 42171", async () => {
    const sony = await runVautoAgent(requestFor("Parduodu Sony WH-1000XM5 ausines"));
    assert.equal(draftOf(sony).price, 0);
    const makita = await runVautoAgent(requestFor("Parduodu Makita DDF484 grąžtą"));
    assert.equal(draftOf(makita).price, 0);
    const lego = await runVautoAgent(requestFor("Parduodu LEGO Technic 42171 konstruktorių"));
    assert.equal(draftOf(lego).price, 0);
  });
});

describe("P0 — vienišas „po“: tik kainos konstrukciją suprantanti funkcija šalina raktažodžius", () => {
  const LONE_PO_CASES: Array<{ text: string; expectedTitle: string }> = [
    { text: "Parduodu krepšį po stalu", expectedTitle: "Krepšis po stalu" },
    { text: "Parduodu lentyną po televizoriumi", expectedTitle: "Lentyna po televizoriumi" },
    { text: "Parduodu krepšį po 100 eurų", expectedTitle: "Krepšis" },
    { text: "Parduodu prekes po 50 €", expectedTitle: "Prekės" },
    { text: "Parduodu po remonto likusį variklį", expectedTitle: "Po remonto likusį variklį" },
  ];
  for (const c of LONE_PO_CASES) {
    it(`„${c.text}“ → title „${c.expectedTitle}“ (vienišas „po“ neištrinamas, kainos konstrukcija pašalinama)`, async () => {
      const response = await runVautoAgent(requestFor(c.text));
      const draft = draftOf(response);
      assert.equal(draft.title, c.expectedTitle);
    });
  }
});

describe("P0 — mažosiomis rašyti brandai/modeliai/akronimai/svetimžodžiai nekeičiami", () => {
  const LOWERCASE_TOKEN_CASES: Array<{ text: string; tokens: string[]; unchanged: string[] }> = [
    {
      text: "Parduodu nike air max 90 batus",
      tokens: ["nike", "air", "max", "90"],
      unchanged: ["nike", "air", "max", "90"],
    },
    {
      text: "Parduodu sony wh-1000xm5 ausines",
      tokens: ["sony", "wh-1000xm5"],
      unchanged: ["sony", "wh-1000xm5"],
    },
    {
      text: "Parduodu usb-c hub adapterį",
      tokens: ["usb-c", "hub"],
      unchanged: ["usb-c", "hub"],
    },
    {
      text: "Parduodu lego technic 42171 konstruktorių",
      tokens: ["lego", "technic", "42171", "konstruktorių"],
      unchanged: ["lego", "technic", "42171", "konstruktorių"],
    },
    {
      text: "Parduodu tesla model s automobilį",
      tokens: ["tesla", "model", "s"],
      unchanged: ["tesla", "model", "s"],
    },
    {
      text: "Parduodu ssd 1tb diską",
      tokens: ["ssd", "1tb"],
      unchanged: ["ssd", "1tb"],
    },
  ];
  for (const c of LOWERCASE_TOKEN_CASES) {
    it(`${c.text.slice(0, 42)}… — reikšminiai tokenai išlieka nepakeisti`, async () => {
      const response = await runVautoAgent(requestFor(c.text));
      const draft = draftOf(response);
      const titleLower = String(draft.title ?? "").toLowerCase();
      for (const token of c.tokens) {
        assert.ok(titleLower.includes(token), `title „${draft.title}“ must keep „${token}“`);
      }
      for (const token of c.unchanged) {
        assert.ok(
          titleLower.includes(token.toLowerCase()),
          `token „${token}“ must not be morphed (title: „${draft.title}“)`
        );
      }
      assert.equal(isGenericListingDraftTitle(draft.title), false);
    });
  }

  it("nežinomas daiktavardis nėra dirbtinai linksniuojamas", async () => {
    const response = await runVautoAgent(requestFor("Parduodu konstruktorių su daug dalių"));
    const draft = draftOf(response);
    assert.match(String(draft.title ?? "").toLowerCase(), /konstruktorių/);
  });
});

describe("P0 — natūralūs paslaugų ir darbo sakiniai (fresh-create)", () => {
  const NATURAL_CASES: Array<{ text: string; category: string; expectedTitle: string }> = [
    { text: "Siūlau buto valymo paslaugas", category: "services", expectedTitle: "Buto valymo paslaugos" },
    { text: "Teikiu automobilių remonto paslaugas", category: "services", expectedTitle: "Automobilių remonto paslaugos" },
    { text: "Siūlau darbą patyrusiam pardavėjui", category: "jobs", expectedTitle: "Pardavėjas" },
    { text: "Ieškome vyresniojo buhalterio", category: "jobs", expectedTitle: "Buhalteris" },
    { text: "Reikalingas C kategorijos vairuotojas", category: "jobs", expectedTitle: "Vairuotojas" },
  ];
  for (const c of NATURAL_CASES) {
    it(`„${c.text}“ → ${c.category}, tikslus title „${c.expectedTitle}“`, async () => {
      const response = await runVautoAgent(requestFor(c.text));
      const draft = draftOf(response);
      assert.equal(draft.category, c.category);
      assert.equal(draft.title, c.expectedTitle);
      assert.doesNotMatch(response.reply, /atnaujinau kainą/i);
    });
  }
});

describe("P0 — keli skaičiai viename sakinyje nesupainioja kainos", () => {
  it("BMW 320d 2015 m., 150000 km, 190 kW → kaina 9500, metai 2015", async () => {
    const response = await runVautoAgent(
      requestFor("Parduodu naudotą BMW 320d 2015 m., 150000 km, 190 kW, Kaune, kaina 9500 eurų")
    );
    const draft = draftOf(response);
    assert.equal(draft.price, 9500);
    assert.equal(draft.attributes?.year, "2015");
    assert.equal(draft.title, "BMW 320d 2015");
  });

  it("iPhone 15 Pro 256 GB, 2015 m., 850 eurų → kaina 850, talpa/modelis title", async () => {
    const response = await runVautoAgent(
      requestFor("Parduodu naudotą iPhone 15 Pro 256 GB, 2015 m., Kaune, kaina 850 eurų")
    );
    const draft = draftOf(response);
    assert.equal(draft.price, 850);
    assert.equal(draft.title, "iPhone 15 Pro 256 GB");
    assert.equal(draft.attributes?.storage, "256 GB");
  });

  it("3 kambarių butas, 85 m², kaina 85000 eurų → kaina 85000, rooms 3", async () => {
    const response = await runVautoAgent(
      requestFor("Parduodu 3 kambarių butą, 85 m², Vilniuje, kaina 85000 eurų")
    );
    const draft = draftOf(response);
    assert.equal(draft.price, 85000);
    assert.equal(draft.attributes?.rooms, "3");
    assert.equal(draft.title, "3 kambarių butas");
  });
});
