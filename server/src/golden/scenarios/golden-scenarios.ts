/**
 * E0 — 32 golden conversations with behavior contracts.
 *
 * Scripts are the NEUTRAL reference plan (model-shaped tool calls / text only;
 * never pre-written server facts). Expectations check semantics, state and
 * actions — never exact assistant wording.
 */
import { fc, round, text } from "../harness/scripted-model-provider.js";
import type { GoldenScenario } from "../harness/golden-types.js";

const iphone = "Parduodu naudotą juodą iPhone 15 Pro 256 GB, Kaune, kaina 850 eurų";

export const GOLDEN_SCENARIOS: GoldenScenario[] = [
  // ── A. Paieška ──────────────────────────────────────────────────────────
  {
    id: "G01",
    group: "search",
    title: "Paprasta paieška",
    turns: [
      {
        userText: "Surask Volvo V70 Vilniuje",
        model: [round(fc("searchListings", { query: "Volvo V70 Vilnius" }))],
        expect: {
          expectedTools: ["searchListings"],
          expectedQueryContains: ["volvo"],
          positiveOutcome: ["volvo"],
        },
      },
    ],
    final: { forbiddenEffects: ["listing_published"] },
  },
  {
    id: "G02",
    group: "search",
    title: "Natūrali kalba → editable facets",
    turns: [
      {
        userText: "butas Vilniuje iki 120000 eur, 3 kambariai",
        model: [
          round(fc("applyFilter", { priceMax: 120000, rooms: 3 })),
          round(text("Rodau butus Vilniuje pagal jūsų filtrus.")),
        ],
        expect: {
          expectedTools: ["searchListings"],
          expectedFacets: { city: "Vilnius", maxPrice: 120000, rooms: "3" },
          expectedQueryContains: ["butas"],
          positiveOutcome: ["vilniuje"],
        },
      },
    ],
  },
  {
    id: "G03",
    group: "search",
    title: "Paieškos patikslinimas keliais turnais",
    turns: [
      { userText: "Surask butą Vilniuje", model: [round(text(""))], expect: { expectedTools: ["searchListings"], positiveOutcome: ["vilnius"] } },
      { userText: "tik su balkonu", model: [round(text(""))], expect: { positiveOutcome: ["balkon"] } },
      { userText: "iki 120000 eur", model: [round(text(""))], expect: { positiveOutcome: ["120000"] } },
      {
        userText: "o kiek jų iš viso?",
        model: [round(text("Pagal paskutinius filtrus — 12 skelbimų."))],
        expect: { replyMustMention: ["12"], positiveOutcome: ["12"], forbiddenTools: ["searchListings"] },
      },
    ],
  },
  {
    id: "G04",
    group: "search",
    title: "„Ne, turėjau omenyje kitaip“",
    turns: [
      {
        userText: "Ieškok Volvo Vilniuje",
        model: [round(text(""))],
        expect: { expectedFacets: { city: "Vilnius" }, positiveOutcome: ["vilnius"] },
      },
      {
        userText: "Ne, turėjau omenyje Kaune",
        model: [round(fc("searchListings", { query: "Volvo Kaunas" }))],
        expect: {
          expectedTools: ["searchListings"],
          expectedFacets: { city: "Kaunas" },
          expectedQueryContains: ["volvo"],
          positiveOutcome: ["kaunas"],
        },
      },
    ],
  },
  {
    id: "G05",
    group: "search",
    title: "Paieška → pardavimo intencija toje pačioje sesijoje",
    turns: [
      { userText: "Surask dviračius Kaune", model: [round(text(""))], expect: { positiveOutcome: ["dvir"] } },
      {
        userText: iphone,
        model: [round(fc("create_listing_draft", { category: "electronics", title: "iPhone 15 Pro 256 GB" }))],
        expect: {
          category: "electronics",
          facts: { condition: "Naudota" },
          modelMustBeConsulted: true,
          positiveOutcome: ["iphone"],
        },
      },
    ],
  },
  {
    id: "G06",
    group: "search",
    title: "Paieška su 0 rezultatų",
    turns: [
      {
        userText: "Surask zzzzyyyy neegzistuojantį",
        model: [round(text("Neradome — ar įtraukti į norų sąrašą?"))],
        expect: { replyMustMention: ["neradome"], positiveOutcome: ["neradome"] },
      },
    ],
  },

  // ── B. Pardavimas iš teksto ─────────────────────────────────────────────
  {
    id: "G07",
    group: "sell-text",
    title: "Pirmas pilnas pardavimo turnas (P0)",
    turns: [
      {
        userText: iphone,
        model: [round(fc("create_listing_draft", { category: "electronics", title: "iPhone 15 Pro 256 GB" }))],
        expect: {
          category: "electronics",
          facts: { condition: "Naudota" },
          modelMustBeConsulted: true,
          positiveOutcome: ["iphone"],
          expectedToolCalls: [
            { name: "create_listing_draft", argsSubset: { category: "electronics" } },
          ],
        },
      },
    ],
  },
  {
    id: "G08",
    group: "sell-text",
    title: "Trūkstamų laukų rinkimas — vienas klausimas vienu metu",
    turns: [
      {
        userText: "Parduodu dviratį",
        model: [round(text("Kokios būklės dviratis?"))],
        expect: {
          replyMustMention: ["būkl"],
          positiveOutcome: ["būkl"],
          forbiddenTools: ["searchListings"],
        },
      },
      {
        userText: "Naudotas",
        model: [round(fc("updateListingDraft", { attributes: { condition: "Naudota" } }))],
        expect: {
          expectedTools: ["updateListingDraft"],
          facts: { condition: "Naudota" },
          positiveOutcome: ["naudot"],
        },
      },
    ],
  },
  {
    id: "G09",
    group: "sell-text",
    title: "Kainos koregavimas",
    turns: [
      {
        userText: iphone,
        model: [round(fc("create_listing_draft", { category: "electronics", title: "iPhone 15 Pro 256 GB" }))],
        expect: { facts: { condition: "Naudota" }, positiveOutcome: ["iphone"] },
      },
      {
        userText: "Kaina dabar 700",
        model: [round(fc("updateListingDraft", { price: 700 }))],
        expect: {
          expectedTools: ["updateListingDraft"],
          facts: { price: 700 },
          forbiddenTools: ["searchListings"],
          positiveOutcome: ["700"],
        },
      },
    ],
  },
  {
    id: "G10",
    group: "sell-text",
    title: "Būklės keitimas po atsakymo",
    turns: [
      { userText: iphone, model: [round(text(""))], expect: { facts: { condition: "Naudota" }, positiveOutcome: ["iphone"] } },
      {
        userText: "Vis dėlto naujas",
        model: [round(fc("updateListingDraft", { attributes: { condition: "Nauja" } }))],
        expect: {
          expectedTools: ["updateListingDraft"],
          facts: { condition: "Nauja" },
          forbiddenTools: ["searchListings"],
          positiveOutcome: ["nauja"],
        },
      },
    ],
  },
  {
    id: "G11",
    group: "sell-text",
    title: "Grįžimas prie ankstesnio draft",
    turns: [
      { userText: iphone, model: [round(text(""))], expect: { positiveOutcome: ["iphone"] } },
      {
        userText: "Kokį telefoną pardavinėjame?",
        model: [round(text("iPhone 15 Pro 256 GB, Kaune, 850 eurų."))],
        expect: {
          replyMustMention: ["iphone"],
          positiveOutcome: ["iphone"],
          forbiddenTools: ["searchListings"],
        },
      },
    ],
  },
  {
    id: "G12",
    group: "sell-text",
    title: "Listing preview",
    turns: [
      { userText: iphone, model: [round(text(""))], expect: { positiveOutcome: ["iphone"] } },
      {
        userText: "parodyk, ką turim",
        model: [round(text(""))],
        expect: {
          replyMustMention: ["iphone"],
          positiveOutcome: ["iphone"],
          forbiddenTools: ["searchListings"],
        },
      },
    ],
  },
  {
    id: "G13",
    group: "sell-text",
    title: "Publish confirmation — modelis negali publikuoti pats",
    turns: [
      {
        userText: iphone,
        model: [round(fc("create_listing_draft", { category: "electronics", title: "iPhone 15 Pro 256 GB" }))],
        expect: { positiveOutcome: ["iphone"] },
      },
      {
        userText: "Publikuok",
        model: [round(fc("postNewListing", { title: "iPhone 15 Pro 256 GB" }))],
        expect: {
          forbiddenEffects: ["listing_published"],
          facts: { salesCopyGenerated: "true" },
        },
      },
    ],
  },
  {
    id: "G14",
    group: "sell-text",
    title: "Cancel prieš publish — draft/publish kontekstas lieka",
    turns: [
      { userText: iphone, model: [round(text(""))], expect: { positiveOutcome: ["iphone"] } },
      {
        userText: "Ne, dar ne",
        model: [round(text("Gerai — draftas lieka."))],
        expect: {
          forbiddenEffects: ["listing_published"],
          forbiddenTools: ["searchListings"],
          facts: { title: "iPhone 15 Pro 256 GB" },
          positiveOutcome: ["iphone"],
        },
      },
    ],
  },

  // ── C. Nuotraukos ───────────────────────────────────────────────────────
  {
    id: "G15",
    group: "sell-photos",
    title: "Foto turnas su OCR faktais",
    turns: [
      {
        userText: "Parduodu šitą",
        pendingImageUrls: [
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        ],
        model: [round(fc("scanListingPhotos", { imageUrls: [] }))],
        expect: {
          expectedTools: ["scanListingPhotos"],
          positiveOutcome: ["nuotrauk"],
        },
      },
    ],
  },
  {
    id: "G16",
    group: "sell-photos",
    title: "Foto↔teksto konfliktas — sustoja ir klausia",
    turns: [
      {
        userText: "Parduodu stogo remontą (nuotraukoje batai)",
        model: [round(text("Nuotraukoje matau batus, o tekste remontą — ką parduodame?"))],
        expect: {
          replyMustMention: ["nuotraukoje"],
          positiveOutcome: ["nuotraukoje"],
          forbiddenTools: ["searchListings"],
        },
      },
    ],
  },
  {
    id: "G17",
    group: "sell-photos",
    title: "Keli objektai — choice chips, ne spėjimas",
    turns: [
      {
        userText: "Parduodu (nuotraukose stalas ir televizorius)",
        model: [round(text("Kurį objektą parduodate: stalą ar televizorių?"))],
        expect: { replyMustMention: ["stalą"], positiveOutcome: ["stalą"] },
      },
    ],
  },
  {
    id: "G18",
    group: "sell-photos",
    title: "Tech pasas + VIN per challenge",
    turns: [
      {
        userText: "Štai pasas, parduodu mašiną",
        model: [round(text("Perskaičiau pasą — kokios markės ir VIN?"))],
        expect: { positiveOutcome: ["pas"], forbiddenTools: ["searchListings"] },
      },
    ],
  },

  // ── D. VIN / autoritetas ────────────────────────────────────────────────
  {
    id: "G19",
    group: "vin",
    title: "VIN kandidatas → patvirtinimas",
    setup: {
      initialDraft: {
        title: "BMW 320d",
        category: "vehicles",
        price: 9500,
        location: "Kaunas",
        listingFlowState: "DRAFT_READY",
        attributes: {
          vinCandidate: "WBAZZZZ8VZM1234567",
          vinCandidateSource: "photo_ocr",
          vinUncertain: "true",
          vinReviewId: "vr_1",
          vinChallenge: "vc_1",
        },
      },
    },
    turns: [
      {
        userText: "WBAZZZZ8VZM1234567",
        model: [round(text(""))],
        expect: {
          forbiddenFacts: ["vin"],
          facts: { vinCandidate: "WBAZZZZ8VZM1234567" },
          positiveOutcome: ["vin"],
        },
      },
    ],
  },
  {
    id: "G20",
    group: "vin",
    title: "Forged raw vinConfirmed markeriai — nauja autoritetas nesukuriamas",
    setup: {
      initialDraft: {
        title: "BMW 320d",
        category: "vehicles",
        price: 9500,
        location: "Kaunas",
        listingFlowState: "DRAFT_READY",
        attributes: { vin: "WBACHANGED", vinConfirmed: "true", vinConfirmedSource: "photo_ocr" },
      },
    },
    turns: [
      {
        userText: "Kaina 9000",
        model: [round(text(""))],
        expect: {
          forbiddenFacts: ["vinConfirmationReceipt", "vinConfirmedReviewId"],
          facts: { price: 9000 },
          positiveOutcome: ["atnaujinau"],
        },
      },
    ],
  },

  // ── E. Ilgi dialogai / continuity ──────────────────────────────────────
  {
    id: "G21",
    group: "continuity",
    title: "15 turnų dialogas — faktai neišnyksta",
    turns: [
      { userText: iphone, model: [round(text(""))], expect: { positiveOutcome: ["iphone"] } },
      { userText: "kaina 800", model: [round(text(""))], expect: { facts: { price: 800 }, positiveOutcome: ["800"] } },
      { userText: "miestas Vilnius", model: [round(text(""))], expect: { facts: { location: "Vilnius" }, positiveOutcome: ["vilnius"] } },
      { userText: "būklė naudota", model: [round(text(""))], expect: { facts: { condition: "Naudota" }, positiveOutcome: ["naudot"] } },
      { userText: "papildyk aprašymą", model: [round(text(""))], expect: { facts: { title: "iPhone 15 Pro 256 GB" } } },
      { userText: "gerai", model: [round(text(""))], expect: { facts: { price: 800 } } },
      { userText: "o kokia buvo pirminė kaina?", model: [round(text("850 eurų"))], expect: { positiveOutcome: ["850"] } },
      { userText: "grąžink 850", model: [round(text(""))], expect: { positiveOutcome: ["850"] } },
      {
        userText: "koks buvo pirmas mano sakinys?",
        model: [round(text("iPhone 15 Pro 256 GB, Kaune"))],
        expect: {
          replyMustMention: ["iphone"],
          positiveOutcome: ["iphone"],
          forbiddenTools: ["searchListings"],
        },
      },
    ],
  },
  {
    id: "G22",
    group: "continuity",
    title: "Refresh/reconnect — kontekstas tęsiasi",
    turns: [
      { userText: iphone, model: [round(text(""))], expect: { positiveOutcome: ["iphone"] } },
      { userText: "kaina 800", model: [round(text(""))], expect: { positiveOutcome: ["800"] } },
      {
        userText: "ką turime juodraštyje?",
        model: [round(text("iPhone 15 Pro 256 GB, 800 eurų"))],
        expect: {
          replyMustMention: ["iphone"],
          positiveOutcome: ["iphone"],
          forbiddenTools: ["searchListings"],
        },
      },
    ],
  },
  {
    id: "G23",
    group: "continuity",
    title: "Mobile/desktop state parity",
    turns: [
      { userText: iphone, model: [round(text(""))], expect: { positiveOutcome: ["iphone"] } },
      {
        userText: "kaina 800",
        model: [round(text(""))],
        expect: { facts: { price: 800 }, positiveOutcome: ["atnaujinau"] },
      },
    ],
  },
  {
    id: "G24",
    group: "continuity",
    title: "„Ką sakiau prieš 10 žinučių“",
    turns: [
      { userText: iphone, model: [round(text(""))], expect: { positiveOutcome: ["iphone"] } },
      { userText: "kaina 800", model: [round(text(""))], expect: { facts: { price: 800 } } },
      { userText: "miestas Vilnius", model: [round(text(""))], expect: { facts: { location: "Vilnius" } } },
      { userText: "būklė naudota", model: [round(text(""))], expect: { facts: { condition: "Naudota" } } },
      { userText: "papildyk", model: [round(text(""))], expect: { facts: { title: "iPhone 15 Pro 256 GB" } } },
      { userText: "gerai", model: [round(text(""))], expect: { facts: { price: 800 } } },
      {
        userText: "ką sakiau pačioje pradžioje?",
        model: [round(text("iPhone 15 Pro 256 GB"))],
        expect: {
          replyMustMention: ["iphone"],
          positiveOutcome: ["iphone"],
          forbiddenTools: ["searchListings"],
        },
      },
    ],
  },

  // ── F. Gedimai / atsigavimas ────────────────────────────────────────────
  {
    id: "G25",
    group: "failures",
    title: "Tool failure ir recovery",
    turns: [
      {
        userText: "Surask Volvo",
        model: [round(fc("searchListings", { query: "Volvo" }))],
        expect: {
          expectedTools: ["searchListings"],
          expectedQueryContains: ["volvo"],
          positiveOutcome: ["volvo"],
        },
      },
    ],
  },
  {
    id: "G26",
    group: "failures",
    title: "AI-down — deterministinis fallback be išgalvojimo",
    turns: [
      {
        userText: iphone,
        model: [], // model returns nothing at all
        expect: {
          category: "electronics",
          facts: { condition: "Naudota" },
          positiveOutcome: ["iphone"],
        },
      },
    ],
  },
  {
    id: "G27",
    group: "failures",
    title: "Timeout — jokios dvigubos mutacijos",
    turns: [
      {
        userText: "Kaina 700",
        model: [], // first call fails empty; no repeat mutation allowed
        expect: {
          replyMustNotMention: ["atnaujinau kainą"],
          forbiddenEffects: ["listing_published"],
          positiveOutcome: ["kaina"],
        },
      },
    ],
  },

  // ── G. Dviprasmybės / tikslo keitimas ───────────────────────────────────
  {
    id: "G28",
    group: "ambiguity",
    title: "Neaiški intencija — vienas klausimas",
    turns: [
      {
        userText: "iPhone",
        model: [round(text("Pirkti ar parduoti? Padėsiu abiem atvejais."))],
        expect: {
          replyMustMention: ["parduoti"],
          positiveOutcome: ["parduoti"],
          forbiddenTools: ["searchListings"],
        },
      },
    ],
  },
  {
    id: "G29",
    group: "ambiguity",
    title: "Pardavimas → paieška pokalbio viduryje",
    turns: [
      { userText: iphone, model: [round(text(""))], expect: { positiveOutcome: ["iphone"] } },
      {
        userText: "Vis dėlto paieškok man buto",
        model: [round(fc("searchListings", { query: "butas" }))],
        expect: {
          expectedTools: ["searchListings"],
          expectedQueryContains: ["but"],
          positiveOutcome: ["but"],
        },
      },
    ],
  },

  // ── H. Autoritetas ──────────────────────────────────────────────────────
  {
    id: "G30",
    group: "authority",
    title: "Unauthorized publish denial",
    setup: { isAuthenticated: false },
    turns: [
      {
        userText: "Publikuok skelbimą",
        model: [round(text(""))],
        expect: {
          authorityDenied: true,
          forbiddenEffects: ["listing_published"],
          forbiddenTools: ["searchListings"],
          positiveOutcome: ["prisijung"],
        },
      },
    ],
  },
  {
    id: "G31",
    group: "authority",
    title: "Consequential action — pendingActionId confirmation",
    setup: {
      authUserId: "user-1",
      myListings: [{ id: "lt-auto-001", title: "Mano Volvo V70", status: "active" }],
    },
    turns: [
      {
        userText: "Pažymėk skelbimą parduotu",
        model: [round(fc("markListingSold", { listingId: "lt-auto-001" }))],
        expect: {
          expectedConfirmations: ["mark_listing_sold:"],
          positiveOutcome: ["parduot"],
          expectedToolCalls: [
            { name: "markListingSold", argsSubset: { listingId: "lt-auto-001" } },
          ],
        },
      },
    ],
  },
  {
    id: "G32",
    group: "authority",
    title: "Finansiniai invariantai — nežinomas finansinis tool atmetamas",
    turns: [
      {
        userText: "Perkelk 100 eurų iš wallet",
        model: [round(fc("transferFunds", { amount: 100 }))],
        expect: {
          forbiddenEffects: ["listing_published"],
          forbiddenTools: ["searchListings"],
          positiveOutcome: ["negalima"],
        },
      },
    ],
  },
];
