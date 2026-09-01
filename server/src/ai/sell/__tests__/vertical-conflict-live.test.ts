/**
 * F5 closure — live rooms/workType field-conflict resolution through the REAL
 * `runVautoAgent` draft-update path (same harness the year-conflict suite
 * uses). No network/DB — the deterministic attribute-update branch returns
 * before any Gemini/DB call.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runVautoAgent } from "../../vauto-agent.js";
import type { VautoAgentRequest } from "../../vauto-agent.js";
import {
  extractRoomsFromChat,
  extractWorkTypeFromChat,
  resolveAmbiguousVerticalPatch,
  resolveVerticalConflictPatch,
} from "../vertical-conflict-state.js";
import { slimListingDraftForLlm } from "../../../shared/llm-context-slice.js";

function reDraft(attributes: Record<string, string>) {
  return {
    title: "Butas Vilniuje",
    description: "3 kambarių butas Vilniuje.",
    price: 120000,
    location: "Vilnius",
    category: "real_estate",
    attributes: { propertyType: "Butas", sellerType: "private", ...attributes },
    listingFlowState: "DRAFT_READY" as const,
  };
}

function jobsDraft(attributes: Record<string, string>) {
  return {
    title: "Vairuotojas",
    description: "Ieškau darbo vairuotoju.",
    price: 0,
    location: "Vilnius",
    category: "jobs",
    attributes: {
      jobTitle: "Vairuotojas",
      employmentType: "Pilnas etatas",
      sellerType: "private",
      ...attributes,
    },
    listingFlowState: "DRAFT_READY" as const,
  };
}

function requestFor(
  listingDraft: Record<string, unknown>,
  userText: string
): VautoAgentRequest {
  return {
    messages: [{ role: "user", text: userText }],
    context: {
      userCity: "Vilnius",
      contact: "+37060000000",
      profilePhone: "+37060000000",
      isAuthenticated: true,
      listingDraft,
    },
  };
}

function attrsOf(response: Awaited<ReturnType<typeof runVautoAgent>>): Record<string, string> {
  assert.equal(response.actions.type, "listing_draft");
  const draft = (response.actions as { listingDraft: { attributes?: Record<string, string> } })
    .listingDraft;
  return draft.attributes ?? {};
}

describe("F5 closure — resolveVerticalConflictPatch (pure state machine)", () => {
  it("first value is accepted; same normalized value does not conflict", () => {
    assert.deepEqual(
      resolveVerticalConflictPatch({ field: "rooms", category: "real_estate", priorAttributes: {}, incomingValue: "3" }),
      { rooms: "3" }
    );
    assert.deepEqual(
      resolveVerticalConflictPatch({ field: "rooms", category: "real_estate", priorAttributes: { rooms: "3" }, incomingValue: "3" }),
      {}
    );
    assert.deepEqual(
      resolveVerticalConflictPatch({ field: "workType", category: "jobs", priorAttributes: { workType: "Biure" }, incomingValue: "Biure" }),
      {}
    );
  });

  it("different B opens a conflict: A stays canonical, B is the candidate", () => {
    assert.deepEqual(
      resolveVerticalConflictPatch({ field: "rooms", category: "real_estate", priorAttributes: { rooms: "3" }, incomingValue: "2" }),
      { rooms: "3", roomsConflict: "true", roomsConflictCandidate: "2" }
    );
  });

  it("unrelated turn preserves; A/B resolve; third C fails closed", () => {
    const conflicted = { rooms: "3", roomsConflict: "true", roomsConflictCandidate: "2" };
    assert.deepEqual(
      resolveVerticalConflictPatch({ field: "rooms", category: "real_estate", priorAttributes: conflicted }),
      {}
    );
    assert.deepEqual(
      resolveVerticalConflictPatch({ field: "rooms", category: "real_estate", priorAttributes: conflicted, incomingValue: "3" }),
      { rooms: "3", roomsConflict: "", roomsConflictCandidate: "" }
    );
    assert.deepEqual(
      resolveVerticalConflictPatch({ field: "rooms", category: "real_estate", priorAttributes: conflicted, incomingValue: "2" }),
      { rooms: "2", roomsConflict: "", roomsConflictCandidate: "" }
    );
    assert.deepEqual(
      resolveVerticalConflictPatch({ field: "rooms", category: "real_estate", priorAttributes: conflicted, incomingValue: "5" }),
      { rooms: "3", roomsConflict: "true", roomsConflictCandidate: "2" }
    );
  });

  it("category whitelist: other verticals can never create these markers", () => {
    for (const category of ["vehicles", "electronics", "clothing", "services", "jobs", "home", "other"]) {
      assert.deepEqual(
        resolveVerticalConflictPatch({ field: "rooms", category, priorAttributes: { rooms: "3" }, incomingValue: "2" }),
        {},
        `rooms must not leak into ${category}`
      );
    }
    for (const category of ["vehicles", "real_estate", "electronics", "clothing", "services", "home", "other"]) {
      assert.deepEqual(
        resolveVerticalConflictPatch({ field: "workType", category, priorAttributes: { workType: "Biure" }, incomingValue: "Nuotoliu" }),
        {},
        `workType must not leak into ${category}`
      );
    }
  });

  it("extractors are deterministic and bounded (no LLM)", () => {
    assert.equal(extractRoomsFromChat("butas 3 kambarių"), "3");
    assert.equal(extractRoomsFromChat("2 kambariai 65 kv.m"), "2");
    assert.equal(extractRoomsFromChat("kaina 120000 eur"), undefined);
    assert.equal(extractRoomsFromChat("kaina 12 k."), undefined, "tūkst. is never rooms");
    assert.equal(extractRoomsFromChat("2 k."), undefined, "bare k. abbreviation is ambiguous");
    assert.equal(extractRoomsFromChat("2 arba 3 kambariai"), undefined, "ambiguous → fail-closed");
    assert.equal(extractRoomsFromChat("2020 m. statybos"), undefined);
    assert.equal(extractRoomsFromChat("45 kambariai"), undefined, "cap 30");
    assert.equal(extractRoomsFromChat("0 kambarių"), undefined);

    assert.equal(extractWorkTypeFromChat("dirbu biure"), "Biure");
    assert.equal(extractWorkTypeFromChat("  NUOTOLIU  "), "Nuotoliu");
    assert.equal(extractWorkTypeFromChat("hibridas"), "Hibridas");
    assert.equal(extractWorkTypeFromChat("hybrid"), "Hibridas");
    assert.equal(extractWorkTypeFromChat("remote'u"), "Nuotoliu");
    assert.equal(extractWorkTypeFromChat("biure arba nuotoliu"), undefined, "ambiguous → fail-closed");
    assert.equal(extractWorkTypeFromChat("ieškau darbo"), undefined);
    assert.equal(extractWorkTypeFromChat("kartais vakarais"), undefined);
  });

  it("normalizers make semantically equal forms identical", () => {
    assert.deepEqual(
      resolveVerticalConflictPatch({ field: "workType", category: "jobs", priorAttributes: { workType: "Biure" }, incomingValue: "  biuras " }),
      {},
      "case/whitespace/inflection-equal forms never conflict"
    );
    assert.deepEqual(
      resolveVerticalConflictPatch({ field: "workType", category: "jobs", priorAttributes: { workType: "Biure" }, incomingValue: "ofise" }),
      {},
      "legacy equal form never conflicts"
    );
    assert.deepEqual(
      resolveVerticalConflictPatch({ field: "rooms", category: "real_estate", priorAttributes: { rooms: "3" }, incomingValue: "03" }),
      {},
      "numeric normalization"
    );
  });

  it("malformed conflict markers are ignored safely, never manufacture a resolution", () => {
    // Missing candidate — the pending flag is inert.
    const missingCandidate = resolveVerticalConflictPatch({
      field: "rooms",
      category: "real_estate",
      priorAttributes: { rooms: "3", roomsConflict: "true", roomsConflictCandidate: "" },
      incomingValue: "2",
    });
    assert.deepEqual(missingCandidate, { rooms: "3", roomsConflict: "true", roomsConflictCandidate: "2" });

    // Non-"true" flag — inert.
    const weakFlag = resolveVerticalConflictPatch({
      field: "rooms",
      category: "real_estate",
      priorAttributes: { rooms: "3", roomsConflict: "yes", roomsConflictCandidate: "2" },
      incomingValue: "2",
    });
    assert.deepEqual(weakFlag, { rooms: "3", roomsConflict: "true", roomsConflictCandidate: "2" });

    // Oversized/malformed incoming values never become a fact.
    assert.deepEqual(
      resolveVerticalConflictPatch({ field: "rooms", category: "real_estate", priorAttributes: { rooms: "3" }, incomingValue: "999999999999" }),
      {}
    );
    assert.deepEqual(
      resolveVerticalConflictPatch({ field: "workType", category: "jobs", priorAttributes: { workType: "Biure" }, incomingValue: "kartais" }),
      {}
    );
  });

  it("multi-variant turns without a canonical never pick silently (unit)", () => {
    const empty = resolveAmbiguousVerticalPatch({
      field: "rooms",
      category: "real_estate",
      priorAttributes: {},
      variants: ["2", "3"],
    });
    assert.deepEqual(empty.patch, {}, "no variant written as canonical");
    assert.equal(empty.needsClarification, true);

    const work = resolveAmbiguousVerticalPatch({
      field: "workType",
      category: "jobs",
      priorAttributes: {},
      variants: ["Biure", "Nuotoliu"],
    });
    assert.deepEqual(work.patch, {});
    assert.equal(work.needsClarification, true);

    // Malformed active markers without valid canonical/candidate must not
    // block a fresh clarification.
    const malformed = resolveAmbiguousVerticalPatch({
      field: "rooms",
      category: "real_estate",
      priorAttributes: { rooms: "abc", roomsConflict: "true", roomsConflictCandidate: "xyz" },
      variants: ["2", "3"],
    });
    assert.deepEqual(malformed.patch, {}, "no canonical written over malformed state");
    assert.equal(malformed.needsClarification, true);

    // Canonical present → explicit clarification conflict (existing behavior).
    const withCanonical = resolveAmbiguousVerticalPatch({
      field: "rooms",
      category: "real_estate",
      priorAttributes: { rooms: "3" },
      variants: ["2", "3"],
    });
    assert.deepEqual(withCanonical.patch, { rooms: "3", roomsConflict: "true", roomsConflictCandidate: "2" });
    assert.equal(withCanonical.needsClarification, false);
  });
});

describe("F5 closure — live rooms conflict through runVautoAgent (REAL_ESTATE)", () => {
  it("A → B creates a conflict; canonical A preserved; exactly one question", async () => {
    const res = await runVautoAgent(requestFor(reDraft({ rooms: "3" }), "2 kambariai"));
    const attrs = attrsOf(res);
    assert.equal(attrs.rooms, "3", "canonical A preserved");
    assert.equal(attrs.roomsConflict, "true");
    assert.equal(attrs.roomsConflictCandidate, "2");
    assert.match(res.reply, /kuris kambarių skaičius teisingas/);
    assert.equal((res.reply.match(/parašykite:/g) ?? []).length, 1, "exactly one gap question");
    assert.doesNotMatch(res.reply, /kambarių skaičių(?! teisingas)|plotą \(m²\)|ridą \(km\)/, "no second question in the same turn");
    assert.doesNotMatch(res.reply, /atnaujinau kainą/, "a vertical-only update must never claim a price change");
  });

  it("unrelated turn keeps the conflict; explicit choice of A resolves", async () => {
    const t1 = await runVautoAgent(requestFor(reDraft({ rooms: "3" }), "2 kambariai"));
    const draft1 = (t1.actions as { listingDraft: Record<string, unknown> }).listingDraft;

    const t2 = await runVautoAgent(requestFor(draft1, "Kaina dabar 110000 eur"));
    const attrs2 = attrsOf(t2);
    assert.equal(attrs2.rooms, "3");
    assert.equal(attrs2.roomsConflict, "true", "conflict survives unrelated turn");
    assert.equal(attrs2.roomsConflictCandidate, "2");

    const draft2 = (t2.actions as { listingDraft: Record<string, unknown> }).listingDraft;
    const t3 = await runVautoAgent(requestFor(draft2, "3 kambariai"));
    const attrs3 = attrsOf(t3);
    assert.equal(attrs3.rooms, "3");
    assert.equal(attrs3.roomsConflict, undefined);
    assert.equal(attrs3.roomsConflictCandidate, undefined);
  });

  it("explicit choice of B resolves to B; third C fails closed", async () => {
    const t1 = await runVautoAgent(requestFor(reDraft({ rooms: "3" }), "2 kambariai"));
    const draft1 = (t1.actions as { listingDraft: Record<string, unknown> }).listingDraft;

    const t2 = await runVautoAgent(requestFor(draft1, "2 kambarių"));
    const attrs2 = attrsOf(t2);
    assert.equal(attrs2.rooms, "2", "B becomes canonical");
    assert.equal(attrs2.roomsConflict, undefined);
    assert.equal(attrs2.roomsConflictCandidate, undefined);

    const t1b = await runVautoAgent(requestFor(reDraft({ rooms: "3" }), "2 kambariai"));
    const draft1b = (t1b.actions as { listingDraft: Record<string, unknown> }).listingDraft;
    const t3 = await runVautoAgent(requestFor(draft1b, "5 kambariai"));
    const attrs3 = attrsOf(t3);
    assert.equal(attrs3.rooms, "3", "third value never becomes canonical");
    assert.equal(attrs3.roomsConflict, "true");
    assert.equal(attrs3.roomsConflictCandidate, "2");
  });

  it("same normalized value creates no conflict; markers survive draft round-trip", async () => {
    const same = await runVautoAgent(requestFor(reDraft({ rooms: "3" }), "3 kambarių"));
    if (same.actions.type === "listing_draft") {
      const sameAttrs = attrsOf(same);
      assert.equal(sameAttrs.roomsConflict, undefined);
    }
    // A same-value turn may legitimately route to search (no draft change) —
    // the invariant is that it never manufactures a conflict.

    const t1 = await runVautoAgent(requestFor(reDraft({ rooms: "3" }), "2 kambariai"));
    const draft1 = (t1.actions as { listingDraft: Record<string, unknown> }).listingDraft;
    const roundTripped = JSON.parse(JSON.stringify(draft1)) as Record<string, unknown>;
    const t2 = await runVautoAgent(requestFor(roundTripped, "5 kambariai"));
    const attrs2 = attrsOf(t2);
    assert.equal(attrs2.roomsConflict, "true", "markers survive the round-trip");
    assert.equal(attrs2.roomsConflictCandidate, "2");
  });
});

describe("F5 closure — live workType conflict through runVautoAgent (JOBS)", () => {
  it("A → B creates a conflict; canonical preserved; exactly one question", async () => {
    const res = await runVautoAgent(requestFor(jobsDraft({ workType: "Biure" }), "dirbsiu nuotoliu"));
    const attrs = attrsOf(res);
    assert.equal(attrs.workType, "Biure", "canonical preserved");
    assert.equal(attrs.workTypeConflict, "true");
    assert.equal(attrs.workTypeConflictCandidate, "Nuotoliu");
    assert.match(res.reply, /kurios darbo sąlygos teisingos/);
    assert.equal((res.reply.match(/parašykite:/g) ?? []).length, 1, "exactly one gap question");
    assert.doesNotMatch(res.reply, /atlyginimo dydį|darbo formatą \(biuras/, "no second question");
    assert.doesNotMatch(res.reply, /atnaujinau kainą/, "a vertical-only update must never claim a price change");
  });

  it("choose A / choose B / third C fail-closed", async () => {
    const t1 = await runVautoAgent(requestFor(jobsDraft({ workType: "Biure" }), "nuotoliu"));
    const draft1 = (t1.actions as { listingDraft: Record<string, unknown> }).listingDraft;

    const tA = await runVautoAgent(requestFor(draft1, "biuras"));
    const attrsA = attrsOf(tA);
    assert.equal(attrsA.workType, "Biure");
    assert.equal(attrsA.workTypeConflict, undefined);

    const t1b = await runVautoAgent(requestFor(jobsDraft({ workType: "Biure" }), "nuotoliu"));
    const draft1b = (t1b.actions as { listingDraft: Record<string, unknown> }).listingDraft;
    const tB = await runVautoAgent(requestFor(draft1b, "Nuotoliu"));
    const attrsB = attrsOf(tB);
    assert.equal(attrsB.workType, "Nuotoliu");
    assert.equal(attrsB.workTypeConflict, undefined);

    const t1c = await runVautoAgent(requestFor(jobsDraft({ workType: "Biure" }), "nuotoliu"));
    const draft1c = (t1c.actions as { listingDraft: Record<string, unknown> }).listingDraft;
    const tC = await runVautoAgent(requestFor(draft1c, "hibridas"));
    const attrsC = attrsOf(tC);
    assert.equal(attrsC.workType, "Biure");
    assert.equal(attrsC.workTypeConflict, "true");
    assert.equal(attrsC.workTypeConflictCandidate, "Nuotoliu");
  });

  it("same normalized value (case/whitespace) creates no conflict", async () => {
    const res = await runVautoAgent(requestFor(jobsDraft({ workType: "Biure" }), "  BIURE  "));
    if (res.actions.type === "listing_draft") {
      const attrs = attrsOf(res);
      assert.equal(attrs.workTypeConflict, undefined);
    }
    // A same-value turn may route to search (no draft change) — the invariant
    // is that it never manufactures a conflict.
  });
});

describe("F5 closure — cross-vertical isolation and model-visible protection", () => {
  it("rooms markers never appear on vehicles/jobs drafts; workType never on real_estate", async () => {
    const vehicles = {
      title: "BMW 320d",
      description: "BMW 320d 2015 m.",
      price: 9000,
      location: "Vilnius",
      category: "vehicles",
      attributes: { make: "BMW", model: "320d", year: "2015", sellerType: "private" },
      listingFlowState: "DRAFT_READY" as const,
    };
    const res = await runVautoAgent(requestFor(vehicles, "2 kambariai"));
    if (res.actions.type === "listing_draft") {
      const attrs = attrsOf(res);
      assert.equal(attrs.rooms, undefined, "vehicles never gain rooms");
      assert.equal(attrs.roomsConflict, undefined);
    }

    const re = await runVautoAgent(requestFor(reDraft({ rooms: "3" }), "dirbsiu nuotoliu"));
    if (re.actions.type === "listing_draft") {
      const reAttrs = attrsOf(re);
      assert.equal(reAttrs.workType, undefined, "real_estate never gains workType");
      assert.equal(reAttrs.workTypeConflict, undefined);
    }
  });

  it("conflict markers never reach the model-visible slim slice", async () => {
    const t1 = await runVautoAgent(requestFor(reDraft({ rooms: "3" }), "2 kambariai"));
    const draft1 = (t1.actions as { listingDraft: Record<string, unknown> }).listingDraft;
    const slim = slimListingDraftForLlm(draft1);
    assert.ok(slim, "slim produced");
    const json = JSON.stringify(slim);
    assert.ok(!json.includes("roomsConflict"), "no rooms conflict markers in model slice");
    assert.ok(!json.includes("workTypeConflict"));

    const tj = await runVautoAgent(requestFor(jobsDraft({ workType: "Biure" }), "nuotoliu"));
    const draftJ = (tj.actions as { listingDraft: Record<string, unknown> }).listingDraft;
    const slimJ = slimListingDraftForLlm(draftJ);
    assert.ok(!JSON.stringify(slimJ).includes("workTypeConflict"));
  });
});

describe("F5 closure — narrow remediation adversarial live cases", () => {
  it("'kaina 12 k.' updates price only, never rooms", async () => {
    const res = await runVautoAgent(requestFor(reDraft({ rooms: "3" }), "kaina 12 k."));
    if (res.actions.type === "listing_draft") {
      const attrs = attrsOf(res);
      assert.equal(attrs.rooms, "3", "rooms unchanged");
      assert.notEqual(attrs.rooms, "12");
      assert.equal(attrs.roomsConflict, undefined);
    }
  });

  it("'2 arba 3 kambariai' never picks silently — canonical kept, one clarification asked", async () => {
    const res = await runVautoAgent(requestFor(reDraft({ rooms: "3" }), "2 arba 3 kambariai"));
    const attrs = attrsOf(res);
    assert.equal(attrs.rooms, "3", "state kept");
    assert.equal(attrs.roomsConflict, "true", "explicit clarification conflict");
    assert.equal(attrs.roomsConflictCandidate, "2");
    assert.match(res.reply, /kuris kambarių skaičius teisingas/);
    assert.equal((res.reply.match(/parašykite:/g) ?? []).length, 1);
    assert.doesNotMatch(res.reply, /atnaujinau kainą/);
  });

  it("'biure arba nuotoliu' never picks silently — canonical kept, one clarification asked", async () => {
    const res = await runVautoAgent(requestFor(jobsDraft({ workType: "Biure" }), "biure arba nuotoliu"));
    const attrs = attrsOf(res);
    assert.equal(attrs.workType, "Biure", "state kept");
    assert.equal(attrs.workTypeConflict, "true");
    assert.equal(attrs.workTypeConflictCandidate, "Nuotoliu");
    assert.match(res.reply, /kurios darbo sąlygos teisingos/);
    assert.equal((res.reply.match(/parašykite:/g) ?? []).length, 1);
    assert.doesNotMatch(res.reply, /atnaujinau kainą/);
  });

  it("lowercase/whitespace/legacy semantically equal canonical never conflicts (live)", async () => {
    const res = await runVautoAgent(requestFor(jobsDraft({ workType: "Biure" }), "  ofise  "));
    if (res.actions.type === "listing_draft") {
      const attrs = attrsOf(res);
      assert.equal(attrs.workTypeConflict, undefined, "legacy equal form must not conflict");
    }
  });

  it("oversized input stays bounded and deterministic (live)", async () => {
    const big = `aprašau butą ${"ž".repeat(2000)} 3 kambarių ${"x".repeat(1000)}`;
    const res = await runVautoAgent(requestFor(reDraft({ rooms: "5" }), big));
    const attrs = attrsOf(res);
    assert.equal(attrs.rooms, "5", "canonical preserved");
    assert.equal(attrs.roomsConflict, "true", "single clear value still opens a conflict");
    assert.equal(attrs.roomsConflictCandidate, "3");
  });
});

describe("F5 closure — empty-draft multi-variant clarification (live)", () => {
  function reDraftNoRooms() {
    return {
      title: "Butas Vilniuje",
      description: "Butas Vilniuje.",
      price: 120000,
      location: "Vilnius",
      category: "real_estate",
      attributes: { propertyType: "Butas", heatingType: "Centrinis", sellerType: "private" },
      listingFlowState: "DRAFT_READY" as const,
    };
  }

  function jobsDraftNoWorkType() {
    return {
      title: "Vairuotojas",
      description: "Ieškau darbo vairuotoju.",
      price: 0,
      location: "Vilnius",
      category: "jobs",
      attributes: {
        jobTitle: "Vairuotojas",
        employmentType: "Pilnas etatas",
        salaryMin: "2000",
        sellerType: "private",
      },
      listingFlowState: "DRAFT_READY" as const,
    };
  }

  it("'2 arba 3 kambariai' on a draft without rooms: no silent pick, one clarification question", async () => {
    const res = await runVautoAgent(requestFor(reDraftNoRooms(), "2 arba 3 kambariai"));
    const attrs = attrsOf(res);
    assert.equal(attrs.rooms, undefined, "no variant written as canonical");
    assert.equal(attrs.roomsConflict, undefined, "no manufactured conflict");
    assert.doesNotMatch(res.reply, /kuris kambarių skaičius teisingas/);
    assert.equal((res.reply.match(/parašykite:/g) ?? []).length, 1, "exactly one question");
    assert.doesNotMatch(res.reply, /atnaujinau kainą/);
  });

  it("'biure arba nuotoliu' on a draft without workType: no silent pick, one clarification question", async () => {
    const res = await runVautoAgent(requestFor(jobsDraftNoWorkType(), "biure arba nuotoliu"));
    const attrs = attrsOf(res);
    assert.equal(attrs.workType, undefined, "no variant written as canonical");
    assert.equal(attrs.workTypeConflict, undefined);
    assert.doesNotMatch(res.reply, /kurios darbo sąlygos teisingos/);
    assert.equal((res.reply.match(/parašykite:/g) ?? []).length, 1, "exactly one question");
    assert.doesNotMatch(res.reply, /atnaujinau kainą/);
  });

  it("malformed active markers + multi-variant turn: fresh clarification, no silent canonical", async () => {
    const draft: Record<string, unknown> = {
      ...(reDraftNoRooms() as unknown as Record<string, unknown>),
      attributes: {
        ...reDraftNoRooms().attributes,
        rooms: "abc",
        roomsConflict: "true",
        roomsConflictCandidate: "xyz",
      },
    };
    const res = await runVautoAgent(requestFor(draft, "2 arba 3 kambariai"));
    const attrs = attrsOf(res);
    assert.equal(attrs.rooms, "abc", "malformed canonical not silently rewritten");
    assert.equal(
      (res.reply.match(/parašykite:/g) ?? []).length,
      1,
      "exactly one clarification question"
    );
  });
});
