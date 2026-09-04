/**
 * P0 — client/server readiness prompt parity.
 *
 * The server's PrePublish block message must ask the SAME single question the
 * client's canonical missing guide asks, in the SAME priority order:
 * conflict → auth → title → category → condition → price → phone → city →
 * photo. `ok=false` must never ship a message that fails to mention the real
 * top-priority blocker.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildConversationalMissingPrompt } from "../../listing-conversational-flow.js";
import { evaluateServerPrePublishReadiness } from "../../pre-publish-validation.js";
import {
  buildFactConflictQuestion,
  type ActiveFactConflict,
} from "../../../shared/fact-conflict.js";
import {
  AWAITING_PHOTOS_PROMPT,
  PROFILE_CITY_REQUIRED,
  PROFILE_PHONE_REQUIRED,
} from "../../../shared/listing-organism.js";

const CONDITION_CONFLICT: ActiveFactConflict = {
  field: "condition",
  canonical: "Naudota",
  candidate: "Nauja",
};

describe("P0 — server buildConversationalMissingPrompt parity (all states)", () => {
  it("aktyvus konfliktas → tikslus buildFactConflictQuestion", () => {
    const out = buildConversationalMissingPrompt({ activeConflict: CONDITION_CONFLICT });
    assert.equal(out, buildFactConflictQuestion(CONDITION_CONFLICT));
  });

  it("trūksta title → vienas konkretus title klausimas", () => {
    assert.equal(
      buildConversationalMissingPrompt({ missingTitle: true }),
      "Kokį daiktą parduodate? Parašykite prekės pavadinimą, pvz. „USB klaviatūra“."
    );
  });

  it("trūksta category → vienas konkretus category klausimas", () => {
    assert.equal(
      buildConversationalMissingPrompt({ missingCategory: true }),
      "Kokiai kategorijai priskirti skelbimą? Pvz. Elektronika, Mada, Namai ir buitis, Transportas."
    );
  });

  it("trūksta condition → vienas konkretus būklės klausimas", () => {
    assert.equal(
      buildConversationalMissingPrompt({ missingCondition: true }),
      "Kokia prekės būklė? Pvz. „Nauja“ arba „Naudota“."
    );
  });

  it("missingAuth → prisijungimo klausimas", () => {
    assert.equal(
      buildConversationalMissingPrompt({ missingAuth: true }),
      "Norint publikuoti, reikia prisijungti — prisijunkite ir tęsime kaip asmeninis brokeris."
    );
  });

  it("missingPrice → kainos klausimas", () => {
    assert.equal(
      buildConversationalMissingPrompt({ missingPrice: true }),
      "Kokią kainą norėtumėte matyti skelbime? Parašykite sumą eurais arba „Kainos sutartinės“."
    );
  });

  it("missingPhone / missingCity / missingPhoto → canonical profilės pranešimai", () => {
    assert.equal(buildConversationalMissingPrompt({ missingPhone: true }), PROFILE_PHONE_REQUIRED);
    assert.equal(buildConversationalMissingPrompt({ missingCity: true }), PROFILE_CITY_REQUIRED);
    assert.equal(buildConversationalMissingPrompt({ missingPhoto: true }), AWAITING_PHOTOS_PROMPT);
  });

  it("prioritetas: konfliktas > title > category > condition > price", () => {
    const all = {
      activeConflict: CONDITION_CONFLICT,
      missingTitle: true,
      missingCategory: true,
      missingCondition: true,
      missingPrice: true,
      missingPhone: true,
      missingCity: true,
    };
    assert.equal(buildConversationalMissingPrompt(all), buildFactConflictQuestion(CONDITION_CONFLICT));

    const noConflict = { ...all, activeConflict: null };
    assert.match(buildConversationalMissingPrompt(noConflict), /Kokį daiktą parduodate/);

    assert.match(
      buildConversationalMissingPrompt({ missingTitle: false, missingCategory: true, missingCondition: true }),
      /Kokiai kategorijai/
    );

    assert.match(
      buildConversationalMissingPrompt({ missingCategory: false, missingCondition: true, missingPrice: true }),
      /Kokia prekės būklė/
    );
  });
});

describe("P0 — evaluateServerPrePublishReadiness: ok=false visada įvardija tikrą aukščiausią blockerį", () => {
  const base = {
    isAuthenticated: true,
    profilePhone: "+37060000000",
    contact: "+37060000000",
    userCity: "Vilnius",
  };

  it("generinis title → ok=false + TITLE klausimas (ne condition/price)", () => {
    const r = evaluateServerPrePublishReadiness({
      ...base,
      listingDraft: {
        title: "Naujas skelbimas",
        category: "electronics",
        price: 850,
        location: "Kaunas",
        attributes: { condition: "Naudota" },
      },
    });
    assert.equal(r.ok, false);
    assert.match(r.blockMessage, /Kokį daiktą parduodate/);
    assert.doesNotMatch(r.blockMessage, /būklė|kaina/i);
  });

  it("trūksta būklės → ok=false + CONDITION klausimas", () => {
    const r = evaluateServerPrePublishReadiness({
      ...base,
      listingDraft: {
        title: "iPhone 15 Pro",
        category: "electronics",
        price: 850,
        location: "Kaunas",
        attributes: {},
      },
    });
    assert.equal(r.ok, false);
    assert.match(r.blockMessage, /Kokia prekės būklė/);
  });

  it("aktyvus konfliktas → ok=false + konflikto klausimas", () => {
    const r = evaluateServerPrePublishReadiness({
      ...base,
      listingDraft: {
        title: "Butas Vilniuje",
        category: "real_estate",
        price: 120000,
        location: "Vilnius",
        attributes: {
          condition: "Naudota",
          conditionConflict: "true",
          conditionConflictCandidate: "Nauja",
        },
      },
    });
    assert.equal(r.ok, false);
    assert.equal(r.blockMessage, buildFactConflictQuestion(CONDITION_CONFLICT));
  });

  it("neprisijungęs → ok=false + AUTH klausimas", () => {
    const r = evaluateServerPrePublishReadiness({
      ...base,
      isAuthenticated: false,
      listingDraft: {
        title: "iPhone 15 Pro",
        category: "electronics",
        price: 850,
        location: "Kaunas",
        attributes: { condition: "Naudota" },
      },
    });
    assert.equal(r.ok, false);
    assert.match(r.blockMessage, /prisijungti/i);
  });

  it("trūksta kategorijos → ok=false + CATEGORY klausimas", () => {
    const r = evaluateServerPrePublishReadiness({
      ...base,
      listingDraft: {
        title: "iPhone 15 Pro",
        price: 850,
        location: "Kaunas",
        attributes: { condition: "Naudota" },
      },
    });
    assert.equal(r.ok, false);
    assert.match(r.blockMessage, /Kokiai kategorijai/);
  });
});
