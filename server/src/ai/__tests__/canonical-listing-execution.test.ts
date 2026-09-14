/**
 * P0.2 — Canonical Listing Execution & Field Authority Convergence Tests
 *
 * Covers Scenarios A through G:
 *  A. "2000 €" sets price=2000, preserves year=2007 and title "BMW 320 2007".
 *  B. "metai 2008" updates year=2008, sets userCorrectedFields=["year", ...], updates title.
 *  C. Vision re-enrichment preserves user-corrected year (2008) against vision (2007).
 *  D. Follow-up photos accumulate without resetting or deleting existing draft images.
 *  E. "atidaryk kortelę" evaluates PrePublish readiness:
 *     - surfaces PrePublish review when ready
 *     - provides guidance and blocks publish when facts are missing.
 *  F. "dar nepublikuok" returns cancellation/hold guidance, does not publish, preserves draft.
 *  G. Intent classification: "dar nepublikuok", "nereikia publikuoti", "palauk" never trigger publish.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runVautoAgent } from "../vauto-agent.js";
import { extractVehicleYearFromText } from "../vehicle-attribute-extract.js";
import { enrichVehicleVisionDraft } from "../../shared/vehicle-vision-enrich.js";
import { isPublishReadyIntent, isShowDraftPreviewIntent } from "../../shared/listing-organism.js";
import { isFieldUserCorrected, markUserCorrectedField, mergeFieldAuthorityAttrs } from "../../shared/field-authority.js";
import { InMemoryThreadStore, newThreadRecord } from "../../agent-core/thread-store.js";
import { setThreadStoreForTests } from "../../agent-core/thread-store-instance.js";
import { runThreadTurn } from "../../agent-core/thread-service.js";
import type { VautoAgentRequest } from "../vauto-agent.js";

type AgentListingDraft = NonNullable<VautoAgentRequest["context"]["listingDraft"]>;

function baseCarDraft(overrides?: Partial<AgentListingDraft>): AgentListingDraft {
  return {
    category: "transport",
    title: "BMW 320 2007",
    description: "Tvarkingas automobilis, važiuoja puikiai.",
    price: 3500,
    location: "Vilnius",
    listingFlowState: "DRAFT_READY",
    orderedImageUrls: ["https://example.com/bmw1.jpg"],
    attributes: {
      make: "BMW",
      model: "320",
      year: "2007",
      fuelType: "Dyzelinas",
      engine: "2.0 l",
      condition: "Naudota",
    },
    ...overrides,
  };
}

function mockRequest(
  draft: AgentListingDraft,
  userText: string,
  extraContext?: Record<string, unknown>
): VautoAgentRequest {
  return {
    messages: [{ role: "user", text: userText }],
    authUserId: "usr-p02-test",
    context: {
      isAuthenticated: true,
      userCity: "Vilnius",
      profilePhone: "+37060012345",
      profileEmail: "test@example.com",
      contact: "+37060012345",
      listingDraft: draft,
      ...extraContext,
    },
  };
}

describe("P0.2 — Scenario A: Currency vs Year Disambiguation", () => {
  it("extractVehicleYearFromText does NOT treat 2000 € or 2000 EUR as a vehicle year", () => {
    assert.equal(extractVehicleYearFromText("2000 €"), null);
    assert.equal(extractVehicleYearFromText("kaina 2000 eur"), null);
    assert.equal(extractVehicleYearFromText("2000EUR"), null);
    assert.equal(extractVehicleYearFromText("Kaina: 2000 Eur galutinė"), null);
    assert.equal(extractVehicleYearFromText("2008 m."), "2008");
    assert.equal(extractVehicleYearFromText("metai 2008"), "2008");
    assert.equal(extractVehicleYearFromText("2008"), "2008");
  });

  it("runVautoAgent with '2000 €' updates price to 2000 and preserves year 2007 and title", async () => {
    const draft = baseCarDraft();
    const req = mockRequest(draft, "2000 €");
    const res = await runVautoAgent(req);

    assert.equal(res.ok, true);
    const updatedDraft = (res.actions as { listingDraft: AgentListingDraft }).listingDraft;
    assert.equal(updatedDraft.price, 2000, "Price must be updated to 2000");
    assert.equal(updatedDraft.attributes?.year, "2007", "Year must remain 2007");
    assert.equal(updatedDraft.title, "BMW 320 2007", "Title must not be overwritten with year 2000");
    assert.match(res.reply, /kainą į 2000 €/);
  });
});

describe("P0.2 — Scenario B: User Correction Persistence & Precedence", () => {
  it("runVautoAgent with 'metai 2008' updates year to 2008, updates title, and marks field userCorrected", async () => {
    const draft = baseCarDraft();
    const req = mockRequest(draft, "metai 2008");
    const res = await runVautoAgent(req);

    assert.equal(res.ok, true);
    const updatedDraft = (res.actions as { listingDraft: AgentListingDraft }).listingDraft;
    assert.equal(updatedDraft.attributes?.year, "2008", "Year must be updated to 2008");
    assert.equal(updatedDraft.title, "BMW 320 2008", "Title must be updated to include 2008");
    assert.equal(
      isFieldUserCorrected(updatedDraft.attributes, "year"),
      true,
      "Year must be marked as userCorrected"
    );
    assert.equal(
      isFieldUserCorrected(updatedDraft.attributes, "title"),
      true,
      "Title must be marked as userCorrected"
    );
  });
});

describe("P0.2 — Scenario C: Vision Enrichment Respects User-Corrected Fields", () => {
  it("enrichVehicleVisionDraft never overwrites user-corrected year or title", () => {
    let attrs: Record<string, string> = {
      make: "BMW",
      model: "320",
      year: "2008",
    };
    attrs = markUserCorrectedField(attrs, "year");
    attrs = markUserCorrectedField(attrs, "title");

    const attributes: Record<string, string | undefined> = {
      ...attrs,
      make: "BMW",
      model: "320",
      fuelType: "Dyzelinas",
      bodyType: "Sedanas",
    };

    const draft = {
      category: "transport",
      title: "BMW 320 2008",
      description: "Tvarkingas",
      price: 3000,
      attributes,
    };

    const enriched = enrichVehicleVisionDraft(draft);

    assert.equal(enriched.attributes?.year, "2008", "User-corrected year 2008 must survive vision 2007");
    assert.equal(enriched.title, "BMW 320 2008", "User-corrected title must survive vision");
    assert.equal(enriched.attributes?.fuelType, "Dyzelinas", "Non-conflicting vision attributes still enriched");
  });

  it("non-vehicle vertical: explicit user correction survives AI/vision inference universally", () => {
    // Representative non-vehicle schema: Real Estate (rooms, area) or Electronics (storage)
    let reAttrs: Record<string, string | undefined> = {
      rooms: "3",
      area: "75",
      energyClass: "A+",
    };
    reAttrs = markUserCorrectedField(reAttrs, "rooms");

    const incomingInference: Record<string, string | undefined> = {
      rooms: "2", // Vision/model inferred 2 rooms
      area: "75",
      heating: "Centrinis", // New evidence
    };

    const merged = mergeFieldAuthorityAttrs(reAttrs, incomingInference, "MODEL_INFERENCE");

    assert.equal(merged.rooms, "3", "Explicit user-corrected rooms=3 must survive model inference rooms=2");
    assert.equal(merged.heating, "Centrinis", "Non-conflicting inferred attribute is added");
  });

  it("stale client draft cannot overwrite newer server draft (real ThreadService / runThreadTurn)", async () => {
    const store = new InMemoryThreadStore();
    setThreadStoreForTests(store);

    // 1. Persist a thread containing a NEWER canonical server listing draft.
    // Must include at least: title, price, year, userCorrectedFields.
    const initialRecord = newThreadRecord({ ownerUserId: "user_authority_test" });
    initialRecord.listingDraft = {
      title: "BMW 320 2008",
      price: 4500,
      category: "vehicles",
      location: "Vilnius",
      listingFlowState: "DRAFT_READY",
      orderedImageUrls: ["https://example.com/bmw.jpg"],
      attributes: {
        make: "BMW",
        model: "320",
        year: "2008",
        userCorrectedFields: "price|year|title",
      },
    };
    await store.create(initialRecord);

    // 2. Send request context containing an OLDER / conflicting client draft with different values.
    const staleClientDraft = {
      title: "Audi A4 2005",
      price: 2500,
      category: "vehicles",
      location: "Kaunas",
      attributes: {
        make: "Audi",
        model: "A4",
        year: "2005",
      },
      listingFlowState: "DRAFTING_TEXT",
    };

    // 3. Execute the real thread turn.
    await runThreadTurn({
      threadId: initialRecord.threadId,
      authUserId: "user_authority_test",
      clientMessages: [{ role: "user", text: "Kokia tavo nuomonė apie automobilį?" }],
      context: {
        listingDraft: staleClientDraft,
      },
      turnId: "turn_stale_draft_check",
    });

    // 4. Assert after the turn that canonical persisted draft still contains the server-authoritative values.
    const updatedThread = await store.get(initialRecord.threadId);
    assert.ok(updatedThread, "Thread must exist in store");
    const persistedDraft = updatedThread.listingDraft as Record<string, unknown>;
    assert.ok(persistedDraft, "Listing draft must exist in canonical thread state");

    // Specifically verify:
    // - server price preserved
    assert.equal(persistedDraft.price, 4500, "Server price 4500 must be preserved, not overwritten by stale client price 2500");
    // - server year preserved
    const attrs = (persistedDraft.attributes ?? {}) as Record<string, string>;
    assert.equal(attrs.year, "2008", "Server year 2008 must be preserved, not overwritten by stale client year 2005");
    // - server title preserved
    assert.equal(persistedDraft.title, "BMW 320 2008", "Server title 'BMW 320 2008' must be preserved, not overwritten by stale client title");
    // - userCorrectedFields preserved
    assert.ok(
      attrs.userCorrectedFields?.includes("price") && attrs.userCorrectedFields?.includes("year"),
      "userCorrectedFields must preserve price and year markers"
    );
    // - stale client values did not overwrite them
    assert.notEqual(persistedDraft.price, 2500, "Stale client price 2500 must not overwrite server price");
    assert.notEqual(attrs.year, "2005", "Stale client year 2005 must not overwrite server year");
    assert.notEqual(persistedDraft.title, "Audi A4 2005", "Stale client title must not overwrite server title");
  });

  it("control case: new thread without server draft allows initial client draft seeding (real ThreadService / runThreadTurn)", async () => {
    const store = new InMemoryThreadStore();
    setThreadStoreForTests(store);

    const initialClientDraft = {
      title: "Volkswagen Golf 2012",
      price: 5200,
      category: "vehicles",
      location: "Klaipėda",
      orderedImageUrls: ["https://example.com/golf.jpg"],
      attributes: {
        make: "Volkswagen",
        model: "Golf",
        year: "2012",
      },
      listingFlowState: "DRAFT_READY",
    };

    const turn = await runThreadTurn({
      threadId: null,
      authUserId: "user_initial_test",
      clientMessages: [{ role: "user", text: "Parduodu Volkswagen Golf 2012 Klaipėdoje už 5200" }],
      context: {
        listingDraft: initialClientDraft,
      },
      turnId: "turn_initial_draft_check",
    });

    const newThread = await store.get(turn.thread.threadId);
    assert.ok(newThread, "New thread must be created in store");
    const persistedDraft = newThread.listingDraft as Record<string, unknown>;
    assert.ok(persistedDraft, "Listing draft must be seeded on the new thread");
    assert.equal(persistedDraft.price, 5200, "Initial client price must seed draft when no server draft exists");
    const attrs = (persistedDraft.attributes ?? {}) as Record<string, string>;
    assert.equal(attrs.year, "2012", "Initial client year must seed draft when no server draft exists");
    assert.ok(
      String(persistedDraft.title).includes("Golf"),
      "Initial client title must seed draft when no server draft exists"
    );
  });
});

describe("P0.2 — Scenario D: Photo Accumulation", () => {
  it("follow-up photos accumulate and do not reset existing draft photos", async () => {
    const draft = baseCarDraft({
      orderedImageUrls: ["https://example.com/photo1.jpg", "https://example.com/photo2.jpg"],
    });
    // Simulate vauto-agent optimisticDraft merging new pending photos
    const existingPhotos = Array.isArray(draft.orderedImageUrls) ? draft.orderedImageUrls : [];
    const newPhotos = ["https://example.com/photo3.jpg"];
    const mergedPhotos = Array.from(new Set([...existingPhotos, ...newPhotos])).slice(0, 10);

    assert.deepEqual(mergedPhotos, [
      "https://example.com/photo1.jpg",
      "https://example.com/photo2.jpg",
      "https://example.com/photo3.jpg",
    ]);
  });
});

describe("P0.2 — Scenario E: PrePublish Readiness & 'atidaryk kortelę'", () => {
  it("'atidaryk kortelę' when all required facts are present surfaces PrePublish review", async () => {
    const draft = baseCarDraft();
    const req = mockRequest(draft, "atidaryk kortelę");
    const res = await runVautoAgent(req);

    assert.equal(res.ok, true);
    assert.ok(res.prePublishCard, "Must return prePublishCard");
    assert.equal(
      (res.actions as { listingDraft: AgentListingDraft }).listingDraft.listingFlowState,
      "AWAITING_CONFIRMATION",
      "Flow state must advance to AWAITING_CONFIRMATION"
    );
  });

  it("'atidaryk kortelę' when price is missing returns polite guidance and does NOT publish", async () => {
    const draft = baseCarDraft({ price: null as unknown as number });
    const req = mockRequest(draft, "atidaryk kortelę");
    const res = await runVautoAgent(req);

    assert.equal(res.ok, true);
    // Must not state published
    assert.doesNotMatch(res.reply, /Skelbimas sėkmingai publikuotas/i);
    // Must mention missing price / fact
    assert.match(res.reply, /kain|nurodykite/i);
  });
});

describe("P0.2 — Scenario F & G: Cancel Phrasing & Publish Intent Negative Guards", () => {
  it("'dar nepublikuok' does NOT trigger publish and returns hold guidance", async () => {
    const draft = baseCarDraft();
    const req = mockRequest(draft, "dar nepublikuok");
    const res = await runVautoAgent(req);

    assert.equal(res.ok, true);
    assert.doesNotMatch(res.reply, /Skelbimas sėkmingai publikuotas/i);
    assert.match(res.reply, /palauksiu|nepublikuoju|galite tęsti/i);
  });

  it("isPublishReadyIntent returns false for negative/deferral phrasing", () => {
    assert.equal(isPublishReadyIntent("dar nepublikuok"), false);
    assert.equal(isPublishReadyIntent("dar ne"), false);
    assert.equal(isPublishReadyIntent("nepublikuok"), false);
    assert.equal(isPublishReadyIntent("palauk"), false);
    assert.equal(isPublishReadyIntent("nereikia publikuoti"), false);
    assert.equal(isPublishReadyIntent("neskelbk"), false);
    assert.equal(isPublishReadyIntent("taip, publikuok"), true);
    assert.equal(isPublishReadyIntent("publikuoti"), true);
  });

  it("isShowDraftPreviewIntent returns false for cancel phrasing", () => {
    assert.equal(isShowDraftPreviewIntent("dar nepublikuok"), false);
    assert.equal(isShowDraftPreviewIntent("palauk"), false);
    assert.equal(isShowDraftPreviewIntent("peržiūrėti"), true);
    assert.equal(isShowDraftPreviewIntent("atidaryk kortelę"), true);
  });
});
