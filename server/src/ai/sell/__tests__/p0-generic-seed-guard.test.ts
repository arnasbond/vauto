/**
 * P0 — first-sell-turn fact preservation (generic seed guard).
 *
 * A generic seed draft („Naujas skelbimas“ / empty title) is UI-only state.
 * This suite proves, through the REAL `runVautoAgent` entry point, that such a
 * draft (even forged straight into the server request) can never take the
 * field-update branch — the turn is routed to fresh-create extraction where
 * the current user text is the single fact authority. The same harness also
 * pins the honesty contract of the draft-ready reply/chips and the preserved
 * real-update behavior for concrete drafts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runVautoAgent } from "../../vauto-agent.js";
import type { VautoAgentRequest } from "../../vauto-agent.js";
import {
  buildDraftReadyChatChips,
  buildDraftReadyChatReply,
  isGenericListingDraftTitle,
} from "../../../shared/listing-organism.js";

function forgedGenericDraft(overrides: Record<string, unknown> = {}) {
  return {
    title: "Naujas skelbimas",
    description: "",
    price: 850,
    location: "Kaunas",
    category: "other",
    listingFlowState: "DRAFT_READY" as const,
    attributes: {},
    ...overrides,
  };
}

function requestFor(listingDraft: Record<string, unknown>, userText: string): VautoAgentRequest {
  return {
    messages: [{ role: "user", text: userText }],
    context: {
      userCity: "Vilnius",
      contact: "+37060000000",
      profilePhone: "+37060000000",
      isAuthenticated: true,
      listingDraft,
      freshListingSession: true,
      omitPriorListingDraft: true,
    },
  };
}

function draftOf(response: Awaited<ReturnType<typeof runVautoAgent>>) {
  assert.equal(response.actions.type, "listing_draft");
  const draft = (response.actions as { listingDraft: { title?: string; category?: string; price?: number; attributes?: Record<string, string> } })
    .listingDraft;
  return draft;
}

const CATEGORY_MATRIX: Array<{ category: string; text: string; expected: string }> = [
  { category: "Transportas", text: "Parduodu motocikl", expected: "transport" },
  { category: "Nekilnojamas turtas", text: "Parduodu butas", expected: "real_estate" },
  { category: "Elektronika", text: "Parduodu telefon", expected: "electronics" },
  { category: "Mada", text: "Parduodu striuk", expected: "clothing" },
  { category: "Namai ir buitis", text: "Parduodu stal", expected: "home" },
  { category: "Paslaugos", text: "Teikiu paslaug", expected: "services" },
  { category: "Darbas", text: "Ieškau darbo", expected: "jobs" },
  { category: "Kita", text: "Parduodu žaisl", expected: "other" },
];

describe("P0 — generic seed guard through runVautoAgent (8-category real first-turn path)", () => {
  for (const row of CATEGORY_MATRIX) {
    it(`${row.category}: forged generic draft + first sell text routes to fresh-create (not a price update)`, async () => {
      const response = await runVautoAgent(requestFor(forgedGenericDraft(), row.text));
      const draft = draftOf(response);

      // Never the dishonest price-update intro / full-draft claim:
      assert.doesNotMatch(response.reply, /atnaujinau kainą/i);
      assert.doesNotMatch(response.reply, /Paruošiau pilną/i);
      // Concrete, non-generic title from the current text:
      assert.ok(draft.title, `expected a concrete title for ${row.category}`);
      assert.equal(isGenericListingDraftTitle(draft.title), false);
      // The inferred category wins over the forged „other“:
      assert.equal(draft.category, row.expected);
    });
  }

  it("empty-title forged draft is also routed to fresh-create", async () => {
    const response = await runVautoAgent(
      requestFor(forgedGenericDraft({ title: undefined }), "Parduodu telefon")
    );
    const draft = draftOf(response);
    assert.equal(draft.category, "electronics");
    assert.doesNotMatch(response.reply, /atnaujinau kainą/i);
  });

  it("a forged generic draft with a price can never turn the turn into an update", async () => {
    const response = await runVautoAgent(
      requestFor(forgedGenericDraft({ price: 9999 }), "Parduodu motocikl")
    );
    assert.doesNotMatch(response.reply, /atnaujinau kainą/i);
    const draft = draftOf(response);
    assert.notEqual(draft.price, 9999);
  });

  it("real concrete-draft price change STILL works as an update", async () => {
    const concrete = {
      title: "BMW 320d",
      description: "3 kambarių? Ne — BMW.",
      price: 15000,
      location: "Vilnius",
      category: "vehicles",
      listingFlowState: "DRAFT_READY" as const,
      attributes: { make: "BMW", model: "320d", condition: "Naudota" },
    };
    const response = await runVautoAgent(requestFor(concrete, "Kaina 1200"));
    assert.match(response.reply, /atnaujinau kainą/i);
    const draft = draftOf(response);
    assert.equal(draft.price, 1200);
    assert.equal(draft.title, "BMW 320d");
  });
});

describe("P0 — publish chip has ONE readiness authority (canonical PrePublish readiness)", () => {
  const completeVehicles = {
    title: "BMW 320d",
    description: "Tvarkingas automobilis.",
    price: 15000,
    location: "Vilnius",
    category: "vehicles",
    listingFlowState: "DRAFT_READY" as const,
    attributes: {
      make: "BMW",
      model: "320d",
      condition: "Naudota",
      sellerType: "private",
      mileage: "150000",
      year: "2016",
      techInspection: "2025-01",
      transmission: "Automatinė",
      fuelType: "Dyzelinas",
    },
  };

  function hasPublishChip(response: Awaited<ReturnType<typeof runVautoAgent>>): boolean {
    return (response.quickReplies ?? []).some((r) => String(r).includes("Publikuoti"));
  }

  it("neprisijungęs vartotojas → jokio „Publikuoti“ (canonical missingAuth)", async () => {
    const response = await runVautoAgent({
      messages: [{ role: "user", text: "Kaina 1200" }],
      context: {
        userCity: "Vilnius",
        contact: "+37060000000",
        profilePhone: "+37060000000",
        isAuthenticated: false,
        listingDraft: completeVehicles,
      },
    });
    assert.equal(hasPublishChip(response), false);
    assert.doesNotMatch(response.reply, /Paruošiau pilną/i);
  });

  it("trūksta kontakto → jokio „Publikuoti“ (canonical missingPhone)", async () => {
    const response = await runVautoAgent({
      messages: [{ role: "user", text: "Kaina 1200" }],
      context: {
        userCity: "Vilnius",
        isAuthenticated: true,
        listingDraft: completeVehicles,
      },
    });
    assert.equal(hasPublishChip(response), false);
  });

  it("trūksta būklės → jokio „Publikuoti“ (canonical missingCondition)", async () => {
    const draftWithoutCondition = {
      ...completeVehicles,
      attributes: { make: "BMW", model: "320d", sellerType: "private" },
    };
    const response = await runVautoAgent({
      messages: [{ role: "user", text: "Kaina 1200" }],
      context: {
        userCity: "Vilnius",
        contact: "+37060000000",
        profilePhone: "+37060000000",
        isAuthenticated: true,
        listingDraft: draftWithoutCondition,
      },
    });
    assert.equal(hasPublishChip(response), false);
  });

  it("aktyvus fact conflict → jokio „Publikuoti“ (canonical activeConflict)", async () => {
    const conflictDraft = {
      title: "Butas Vilniuje",
      description: "3 kambarių butas Vilniuje.",
      price: 120000,
      location: "Vilnius",
      category: "real_estate",
      listingFlowState: "DRAFT_READY" as const,
      attributes: {
        propertyType: "Butas",
        rooms: "3",
        condition: "Naudota",
        conditionConflict: "true",
        conditionConflictCandidate: "Nauja",
        sellerType: "private",
      },
    };
    const response = await runVautoAgent({
      messages: [{ role: "user", text: "Kaina 110000" }],
      context: {
        userCity: "Vilnius",
        contact: "+37060000000",
        profilePhone: "+37060000000",
        isAuthenticated: true,
        listingDraft: conflictDraft,
      },
    });
    assert.equal(hasPublishChip(response), false);
  });

  it("VIN peržiūra dar nebaigta → VIN chips, jokio „Publikuoti“", async () => {
    const vinPendingDraft = {
      title: "BMW 320d",
      description: "Tvarkingas automobilis.",
      price: 15000,
      location: "Vilnius",
      category: "vehicles",
      listingFlowState: "DRAFT_READY" as const,
      attributes: {
        make: "BMW",
        model: "320d",
        condition: "Naudota",
        sellerType: "private",
        vinCandidate: "WBAZZZZ8VZM1234567",
        vinCandidateSource: "photo_ocr",
        vinUncertain: "true",
        vinReviewId: "vr_pending_1",
        vinChallenge: "vc_pending_1",
      },
    };
    const response = await runVautoAgent({
      messages: [{ role: "user", text: "WBAZZZZ8VZM1234567" }],
      context: {
        userCity: "Vilnius",
        contact: "+37060000000",
        profilePhone: "+37060000000",
        isAuthenticated: true,
        listingDraft: vinPendingDraft,
      },
    });
    assert.equal(hasPublishChip(response), false);
  });
});

describe("P0 — honest draft-ready reply and chips (canonical readiness)", () => {
  it("generic title is never announced as a full draft; asks one concrete question", () => {
    const reply = buildDraftReadyChatReply({ title: "Naujas skelbimas", price: 850, category: "other" });
    assert.doesNotMatch(reply, /Paruošiau pilną/i);
    assert.match(reply, /Kokį konkretų daiktą/);
    assert.deepEqual(
      buildDraftReadyChatChips({ title: "Naujas skelbimas", price: 850, category: "other" }),
      []
    );
  });

  it("concrete title with gaps: no „pilną“, exactly one question, no publish chip", () => {
    const draft = {
      title: "BMW 320d",
      price: 15000,
      location: "Vilnius",
      category: "vehicles",
      attributes: { make: "BMW", sellerType: "private" },
    };
    const reply = buildDraftReadyChatReply(draft);
    assert.doesNotMatch(reply, /Paruošiau pilną/i);
    assert.match(reply, /Jei turite, parašykite: tikslų modelį —/);
    assert.deepEqual(buildDraftReadyChatChips(draft), ["✏️ Papildyti"]);
  });

  it("complete concrete draft: „pilną“ allowed only on canonical readinessOk=true, publish chip likewise", () => {
    const draft = {
      title: "BMW 320d",
      price: 15000,
      location: "Vilnius",
      category: "vehicles",
      attributes: {
        make: "BMW",
        model: "320d",
        sellerType: "private",
        mileage: "150000",
        year: "2016",
        techInspection: "2025-01",
        transmission: "Automatinė",
        fuelType: "Dyzelinas",
      },
    };
    const reply = buildDraftReadyChatReply(draft, { readinessOk: true });
    assert.match(reply, /Paruošiau pilną/);
    assert.deepEqual(
      buildDraftReadyChatChips(draft, { readinessOk: true }),
      ["🚀 Publikuoti", "✏️ Papildyti"]
    );
  });

  it("heuristic-complete draft WITHOUT canonical readinessOk: no „pilną“, no publish chip", () => {
    const draft = {
      title: "BMW 320d",
      price: 15000,
      location: "Vilnius",
      category: "vehicles",
      attributes: {
        make: "BMW",
        model: "320d",
        sellerType: "private",
        mileage: "150000",
        year: "2016",
        techInspection: "2025-01",
        transmission: "Automatinė",
        fuelType: "Dyzelinas",
      },
    };
    const reply = buildDraftReadyChatReply(draft);
    assert.doesNotMatch(reply, /Paruošiau pilną/i);
    assert.deepEqual(buildDraftReadyChatChips(draft), ["✏️ Papildyti"]);
  });

  it("canonical readinessOk=false suppresses „pilną“ even for a complete-looking draft", () => {
    const draft = {
      title: "BMW 320d",
      price: 15000,
      location: "Vilnius",
      category: "vehicles",
      attributes: {
        make: "BMW",
        model: "320d",
        sellerType: "private",
        mileage: "150000",
        year: "2016",
        techInspection: "2025-01",
        transmission: "Automatinė",
        fuelType: "Dyzelinas",
      },
    };
    const reply = buildDraftReadyChatReply(draft, { readinessOk: false });
    assert.doesNotMatch(reply, /Paruošiau pilną/i);
    assert.deepEqual(buildDraftReadyChatChips(draft, { readinessOk: false }), [
      "✏️ Papildyti",
    ]);
  });

  it("generic title never gets a publish chip even with readinessOk=true", () => {
    assert.deepEqual(
      buildDraftReadyChatChips(
        { title: "Naujas skelbimas", price: 850, category: "other" },
        { readinessOk: true }
      ),
      []
    );
  });
});
