/**
 * F9 — pre-publish fail-closed: an incomplete draft (placeholder title,
 * missing category, missing required condition) can NEVER produce a
 * PrePublish card, set listingPublishConfirmed, or reach the publish action.
 * The missing-guide asks exactly ONE most-important question.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluatePrePublishReadiness,
  buildPrePublishCardPayload,
  buildPrePublishMissingGuide,
  type PrePublishCheckInput,
} from "@/lib/pre-publish-validation";
import { buildConversationalMissingPrompt } from "@/lib/listing-conversational-flow";
import type { AiExtractedListing } from "@/lib/types";

const USER = {
  id: "u1",
  phone: "+37060000000",
  email: "a@b.lt",
  city: "Vilnius",
};

function baseInput(draft: AiExtractedListing | null): PrePublishCheckInput {
  return { isAuthenticated: true, user: USER, draft };
}

function draft(overrides: Partial<AiExtractedListing> = {}): AiExtractedListing {
  return {
    category: "electronics",
    title: "USB klaviatūra",
    description: "juoda",
    price: 15,
    location: "Kaišiadorys",
    contact: "+37060000000",
    confidence: 0.9,
    attributes: { condition: "Naudota" },
    ...overrides,
  };
}

function draftWithoutCategory(): AiExtractedListing {
  const d = draft();
  Reflect.deleteProperty(d, "category");
  return d;
}

const READY_PHOTO = {
  previewImage: "https://cdn.example.com/photo.jpg",
};

function expectBlocked(readiness: ReturnType<typeof evaluatePrePublishReadiness>) {
  assert.equal(readiness.ok, false, "readiness.ok must be false");
  assert.equal(
    buildPrePublishCardPayload(readiness, READY_PHOTO.previewImage),
    null,
    "no PrePublish card may exist for an incomplete draft"
  );
}

describe("F9 — pre-publish fail-closed", () => {
  it("missingTitle: ok=false, kortelės nėra", () => {
    const r = evaluatePrePublishReadiness(baseInput(draft({ title: "Naujas skelbimas" })));
    expectBlocked(r);
  });

  it("missingCategory: ok=false, kortelės nėra", () => {
    const r = evaluatePrePublishReadiness(baseInput(draftWithoutCategory()));
    expectBlocked(r);
  });

  it("missingCondition: ok=false, kortelės nėra", () => {
    const r = evaluatePrePublishReadiness(
      baseInput(draft({ attributes: {} }))
    );
    expectBlocked(r);
  });

  it("visi trys trūksta kartu: ok=false, kortelės nėra", () => {
    const d = draftWithoutCategory();
    d.title = "";
    d.attributes = {};
    const r = evaluatePrePublishReadiness(baseInput(d));
    expectBlocked(r);
  });

  it("pokalbis pateikia tik VIENĄ svarbiausią klausimą", () => {
    const r = evaluatePrePublishReadiness(
      baseInput(
        draft({
          title: "Naujas skelbimas",
          price: 0,
          attributes: {},
          description: "",
        })
      )
    );
    const q = buildConversationalMissingPrompt(r);
    // Title gap wins — exactly one question, no list dump of other gaps.
    assert.match(q, /kokį daiktą parduodate/i);
    assert.doesNotMatch(q, /kaina/i);
    assert.doesNotMatch(q, /kategorij/i);
    assert.doesNotMatch(q, /būklę/i);
  });

  it("publish veiksmas nepasiekiamas: be kortelės nėra publish mygtuko kelio", () => {
    const r = evaluatePrePublishReadiness(baseInput(draft({ title: "" })));
    assert.equal(buildPrePublishCardPayload(r, READY_PHOTO.previewImage), null);
    // The card is the ONLY publish surface; its absence makes the publish
    // function unreachable from the UI.
  });

  it("aktyvus konfliktas blokuoja pre-publish: ok=false, kortelės nėra, vienas klausimas", () => {
    const d = draft();
    d.attributes = {
      condition: "Naudota",
      priceConflict: "true",
      priceConflictCandidate: "999",
    };
    const r = evaluatePrePublishReadiness({ ...baseInput(d), ...READY_PHOTO });
    assert.equal(r.ok, false, "open conflict must block pre-publish");
    assert.ok(r.activeConflict, "typed conflict must be exposed");
    assert.equal(
      buildPrePublishCardPayload(r, READY_PHOTO.previewImage),
      null,
      "no PrePublish card while a conflict is open"
    );
    const q = buildConversationalMissingPrompt(r);
    assert.match(q, /prieštaravimą/i);
    assert.doesNotMatch(q, /kainą norėtumėte/i, "exactly ONE question — the conflict");
  });

  it("išspręstas konfliktas (tombsone) neblokuoja", () => {
    const d = draft();
    d.attributes = {
      condition: "Naudota",
      priceConflict: "",
      priceConflictCandidate: "",
    };
    const r = evaluatePrePublishReadiness({ ...baseInput(d), ...READY_PHOTO });
    assert.equal(r.activeConflict, null);
    assert.equal(r.ok, true);
  });

  it("pilnas draft: ok=true, kortelė egzistuoja", () => {
    const r = evaluatePrePublishReadiness({ ...baseInput(draft()), ...READY_PHOTO });
    assert.equal(r.ok, true);
    assert.ok(buildPrePublishCardPayload(r, READY_PHOTO.previewImage));
  });

  it("paslaugos be būklės → condition nereikalaujama (ok lieka galioti)", () => {
    const r = evaluatePrePublishReadiness({
      ...baseInput(draft({ category: "services", title: "Pamokos", attributes: {} })),
      ...READY_PHOTO,
    });
    assert.equal(r.missingCondition, false);
    assert.equal(r.ok, true);
  });
});

describe("F9 — trūkstamų duomenų gidas", () => {
  it("placeholder pavadinimas → missingTitle", () => {
    const r = evaluatePrePublishReadiness(
      baseInput(draft({ title: "Naujas skelbimas" }))
    );
    assert.equal(r.missingTitle, true);
  });

  it("elektronika be būklės → missingCondition; gidas mini būklę", () => {
    const r = evaluatePrePublishReadiness(baseInput(draft({ attributes: {} })));
    assert.equal(r.missingCondition, true);
    assert.match(buildPrePublishMissingGuide(r), /būklę/i);
  });

  it("pilnas draft → gidas sako paruošta", () => {
    const r = evaluatePrePublishReadiness({ ...baseInput(draft()), ...READY_PHOTO });
    assert.equal(r.missingTitle, false);
    assert.equal(r.missingCategory, false);
    assert.equal(r.missingCondition, false);
    assert.equal(r.missingPhoto, false);
    assert.match(buildPrePublishMissingGuide(r), /paruošta/);
  });

  it("kaina po pavadinimo, miestas po kainos — prioritetas", () => {
    const r = evaluatePrePublishReadiness(
      baseInput(
        draft({
          price: 0,
          location: "",
          attributes: { condition: "Naudota" },
        })
      )
    );
    assert.match(buildConversationalMissingPrompt(r), /kainą/i);
    assert.doesNotMatch(buildConversationalMissingPrompt(r), /miest/i);
  });
});
