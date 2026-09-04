/**
 * P0 — vauto-agent ROUTER integration (supertest).
 *
 * HONEST SCOPE: this mounts `vautoAgentRouter` directly WITHOUT the real
 * `requireAuth` / rate-limit middleware chain, so it is NOT a full
 * browser-equivalent path — it proves the router→runVautoAgent pipeline
 * forms the draft itself for the two Atlas reproductions (with the model
 * layer stubbed to an EMPTY response, the AI-down scenario). Auth boundary
 * behavior is covered separately by the stage16 HTTP authz suite.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import express from "express";
import request from "supertest";

import { vautoAgentRouter } from "../../routes/vauto-agent.js";
import { isGenericListingDraftTitle } from "../../shared/listing-organism.js";

const originalFetch = globalThis.fetch;

before(() => {
  process.env.GEMINI_API_KEY = "p0-http-test-fake-key";
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
});

after(() => {
  globalThis.fetch = originalFetch;
  delete process.env.GEMINI_API_KEY;
});

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/vauto-agent", vautoAgentRouter);
  return app;
}

function bodyFor(userText: string) {
  return {
    messages: [{ role: "user", text: userText }],
    context: {
      userCity: "",
      contact: "+37060000000",
      profilePhone: "+37060000000",
      isAuthenticated: true,
      listingDraft: {
        title: "Naujas skelbimas",
        description: "",
        price: 0,
        location: "",
        category: "other",
        listingFlowState: "DRAFT_READY",
        attributes: {},
      },
      freshListingSession: true,
      omitPriorListingDraft: true,
    },
  };
}

describe("P0 — vauto-agent router integration (serveris pats suformuoja draftą)", () => {
  const app = createTestApp();

  it("iPhone 15 Pro 256 GB — tikslus title, electronics, kaina 850, Kaunas, Naudota", async () => {
    const res = await request(app)
      .post("/api/vauto-agent")
      .send(bodyFor("Parduodu naudotą juodą iPhone 15 Pro 256 GB, Kaune, kaina 850 eurų"));

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.actions.type, "listing_draft");
    const draft = res.body.actions.listingDraft;
    assert.equal(draft.title, "iPhone 15 Pro 256 GB");
    assert.equal(isGenericListingDraftTitle(draft.title), false);
    assert.equal(draft.category, "electronics");
    assert.equal(draft.price, 850);
    assert.equal(draft.location, "Kaunas");
    assert.equal(draft.attributes?.condition, "Naudota");
    assert.equal(draft.attributes?.deviceModel, "iPhone 15 Pro");
    assert.equal(draft.attributes?.storage, "256 GB");
    assert.doesNotMatch(res.body.reply, /atnaujinau kainą/i);
    assert.doesNotMatch(res.body.reply, /Naujas skelbimas/i);
  });

  it("moteriška odinė striukė — tikslus title, clothing, kaina 120, Vilnius, Nauja", async () => {
    const res = await request(app)
      .post("/api/vauto-agent")
      .send(bodyFor("Parduodu naują juodą moterišką odinę striukę, M dydžio, Vilniuje, už 120 eurų"));

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.actions.type, "listing_draft");
    const draft = res.body.actions.listingDraft;
    assert.equal(draft.title, "Moteriška odinė striukė");
    assert.equal(isGenericListingDraftTitle(draft.title), false);
    assert.equal(draft.category, "clothing");
    assert.equal(draft.price, 120);
    assert.equal(draft.location, "Vilnius");
    assert.equal(draft.attributes?.condition, "Nauja");
    assert.equal(draft.attributes?.clothingType, "Striukės");
    assert.equal(draft.attributes?.size, "M");
    assert.doesNotMatch(res.body.reply, /atnaujinau kainą/i);
    assert.doesNotMatch(res.body.reply, /Naujas skelbimas/i);
  });
});
