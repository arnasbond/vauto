/**
 * E2 — ANTI-OVERFITTING: unseen paraphrase variants of the golden semantic
 * classes. None of these texts appear in the 32 golden scenarios — they
 * evaluate the SAME classes through the REAL `runVautoAgent` pipeline with
 * scripted model responses.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runGoldenScenario } from "../harness/golden-simulator.js";
import type { GoldenScenario } from "../harness/golden-types.js";
import { fc, round, text } from "../harness/scripted-model-provider.js";

const IPHONE = "Parduodu naudotą juodą iPhone 15 Pro 256 GB, Kaune, kaina 850 eurų";

function sellThen(sellTurns: GoldenScenario["turns"]): GoldenScenario {
  return {
    id: "PARA",
    group: "paraphrase",
    title: "paraphrase variant",
    turns: [
      { userText: IPHONE, model: [round(text(""))] },
      ...sellTurns,
    ],
  };
}

const VARIANTS: Array<{ name: string; scenario: GoldenScenario }> = [
  {
    name: "cancel: Palauk, kol kas neskelbk",
    scenario: sellThen([
      {
        userText: "Palauk, kol kas neskelbk",
        model: [round(text(""))],
        expect: {
          forbiddenEffects: ["listing_published"],
          forbiddenTools: ["searchListings"],
          facts: { title: "iPhone 15 Pro 256 GB" },
          positiveOutcome: ["iphone"],
        },
      },
    ]),
  },
  {
    name: "cancel: Dar nenoriu publikuoti",
    scenario: sellThen([
      {
        userText: "Dar nenoriu publikuoti",
        model: [round(text(""))],
        expect: {
          forbiddenEffects: ["listing_published"],
          forbiddenTools: ["searchListings"],
          facts: { title: "iPhone 15 Pro 256 GB" },
          positiveOutcome: ["iphone"],
        },
      },
    ]),
  },
  {
    name: "cancel: Sustokim prieš paskelbiant",
    scenario: sellThen([
      {
        userText: "Sustokim prieš paskelbiant",
        model: [round(text(""))],
        expect: {
          forbiddenEffects: ["listing_published"],
          forbiddenTools: ["searchListings"],
          facts: { title: "iPhone 15 Pro 256 GB" },
          positiveOutcome: ["iphone"],
        },
      },
    ]),
  },
  {
    name: "price correction: Dabar kaina 690 eurų",
    scenario: sellThen([
      {
        userText: "Dabar kaina 690 eurų",
        model: [round(fc("updateListingDraft", { price: 690 }))],
        expect: {
          expectedTools: ["updateListingDraft"],
          facts: { price: 690 },
          forbiddenTools: ["searchListings"],
          positiveOutcome: ["690"],
        },
      },
    ]),
  },
  {
    name: "price correction: Pakeisk kainą į 720",
    scenario: sellThen([
      {
        userText: "Pakeisk kainą į 720",
        model: [round(fc("updateListingDraft", { price: 720 }))],
        expect: {
          expectedTools: ["updateListingDraft"],
          facts: { price: 720 },
          forbiddenTools: ["searchListings"],
          positiveOutcome: ["720"],
        },
      },
    ]),
  },
  {
    name: "condition correction: Būklė iš tiesų naudota",
    scenario: sellThen([
      {
        userText: "Būklė iš tiesų naudota",
        model: [round(fc("updateListingDraft", { attributes: { condition: "Naudota" } }))],
        expect: {
          expectedTools: ["updateListingDraft"],
          facts: { condition: "Naudota" },
          forbiddenTools: ["searchListings"],
          positiveOutcome: ["naudot"],
        },
      },
    ]),
  },
  {
    name: "context recall: Kokią kainą buvome nustatę?",
    scenario: sellThen([
      {
        userText: "Kokią kainą buvome nustatę?",
        model: [round(text("850 eurų"))],
        expect: {
          replyMustMention: ["850"],
          positiveOutcome: ["850"],
          forbiddenTools: ["searchListings"],
        },
      },
    ]),
  },
  {
    name: "context recall: Primink, ką parduodame?",
    scenario: sellThen([
      {
        userText: "Primink, ką parduodame?",
        model: [round(text("iPhone 15 Pro 256 GB, Kaune"))],
        expect: {
          replyMustMention: ["iphone"],
          positiveOutcome: ["iphone"],
          forbiddenTools: ["searchListings"],
        },
      },
    ]),
  },
  {
    name: "intent switch: Apsigalvojau — ieškok man buto",
    scenario: sellThen([
      {
        userText: "Apsigalvojau — ieškok man buto",
        model: [round(fc("searchListings", { query: "butas" }))],
        expect: {
          expectedTools: ["searchListings"],
          expectedQueryContains: ["but"],
          positiveOutcome: ["but"],
        },
      },
    ]),
  },
  {
    name: "ambiguous: iPad",
    scenario: {
      id: "PARA",
      group: "paraphrase",
      title: "ambiguous iPad",
      turns: [
        {
          userText: "iPad",
          model: [round(text("Pirkti ar parduoti?"))],
          expect: {
            replyMustMention: ["parduoti"],
            positiveOutcome: ["parduoti"],
            forbiddenTools: ["searchListings"],
          },
        },
      ],
    },
  },
  {
    name: "unauthorized publish: Paskelbk mano skelbimą",
    scenario: {
      id: "PARA",
      group: "paraphrase",
      title: "unauthorized publish",
      setup: { isAuthenticated: false },
      turns: [
        {
          userText: "Paskelbk mano skelbimą",
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
  },
  {
    name: "financial command: Pervesk 50 eurų",
    scenario: {
      id: "PARA",
      group: "paraphrase",
      title: "financial transfer",
      turns: [
        {
          userText: "Pervesk 50 eurų",
          model: [round(text(""))],
          expect: {
            forbiddenEffects: ["listing_published"],
            forbiddenTools: ["searchListings"],
            positiveOutcome: ["negalima"],
          },
        },
      ],
    },
  },
  {
    name: "search correction: Ne, ne Vilniuje — Kaune",
    scenario: {
      id: "PARA",
      group: "paraphrase",
      title: "search correction",
      turns: [
        {
          userText: "Ieškok Volvo Vilniuje",
          model: [round(text(""))],
          expect: { positiveOutcome: ["vilnius"] },
        },
        {
          userText: "Ne, ne Vilniuje — Kaune",
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
  },
  {
    name: "draft preview: Parodyk, ką jau turime",
    scenario: sellThen([
      {
        userText: "Parodyk, ką jau turime",
        model: [round(text(""))],
        expect: {
          replyMustMention: ["iphone"],
          positiveOutcome: ["iphone"],
          forbiddenTools: ["searchListings"],
        },
      },
    ]),
  },
];

describe("E2 — anti-overfitting: unseen paraphrase variants (real pipeline)", () => {
  for (const v of VARIANTS) {
    it(`class: ${v.name}`, async () => {
      const result = await runGoldenScenario(v.scenario);
      assert.equal(
        result.endToEndCorrect,
        true,
        `unseen variant failed: ${result.failures
          .map((f) => `${f.category}: ${f.message}`)
          .join(" | ")}`
      );
    });
  }
});
