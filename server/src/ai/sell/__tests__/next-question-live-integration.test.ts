/**
 * VAUTO AI Maturity — Phase 2B live integration proof (remediated).
 *
 * Asserts that the two live call sites (`buildSellerContextualVoiceFollowUp` used
 * from the chat-tool reply path, and `buildDraftReadyChatReply` used from the
 * spec-patch reply path in `vauto-agent.ts`) actually delegate to
 * `selectNextQuestion` — not a parallel/dead-code implementation.
 *
 * Every expectation below is independently specified (exact field, reason intent,
 * or exact/near-exact Lithuanian text) — none of them compute the "expected"
 * value by calling `selectNextQuestion()` itself. That would make the test pass
 * even if the live function called a different/wrong policy decision, which is
 * exactly the defect this file corrects.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildSellerContextualVoiceFollowUp } from "../../seller-voice-prompt.js";
import { buildDraftReadyChatReply } from "../../../shared/listing-organism.js";

describe("Phase 2B — live integration: buildSellerContextualVoiceFollowUp", () => {
  it("make known + model missing → asks model (not price/mileage) — independently specified", () => {
    const reply = buildSellerContextualVoiceFollowUp(
      "vehicles",
      { make: "BMW" },
      ["price"]
    );
    assert.equal(reply, "Koks automobilio modelis?");
  });

  it("make + model known, everything else missing → asks mileage next — independently specified", () => {
    const reply = buildSellerContextualVoiceFollowUp(
      "vehicles",
      { make: "BMW", model: "320d" },
      []
    );
    assert.equal(reply, "Kokia automobilio rida (km)?");
  });

  it("surfaces a year conflict question end-to-end through the live function", () => {
    const attributes = {
      make: "Audi",
      model: "A4",
      year: "2015",
      yearConflict: "true",
      yearConflictCandidate: "2018",
    };
    const reply = buildSellerContextualVoiceFollowUp("vehicles", attributes, []);
    assert.equal(reply, "Nurodėte skirtingus pagaminimo metus — kurie yra teisingi?");
  });

  it("universal blocker sellerType outranks price and vertical enrichment — independently specified", () => {
    const attributes = {
      make: "Ford",
      model: "Focus",
      mileage: "150000",
      year: "2016",
      techInspection: "2025-01",
      transmission: "Mechaninė",
      fuelType: "Benzinas",
    };
    const reply = buildSellerContextualVoiceFollowUp("vehicles", attributes, [
      "price",
      "sellerType",
    ]);
    assert.equal(reply, "Skelbiate kaip privatus asmuo ar kaip įmonė?");
  });

  it("city blocker is asked once sellerType/price are already known — independently specified", () => {
    const attributes = {
      make: "Ford",
      model: "Focus",
      mileage: "150000",
      year: "2016",
      techInspection: "2025-01",
      transmission: "Mechaninė",
      fuelType: "Benzinas",
    };
    const reply = buildSellerContextualVoiceFollowUp("vehicles", attributes, ["city"]);
    assert.equal(reply, "Kurį miestą rodyti pirkėjams skelbime?");
  });

  it("sequential turns: answering each field in order never repeats a question (live function, no state object)", () => {
    // Turn 1 — only make known; sellerType/city/price all outstanding.
    const t1 = buildSellerContextualVoiceFollowUp(
      "vehicles",
      { make: "BMW" },
      ["price", "sellerType", "city"]
    );
    assert.equal(t1, "Koks automobilio modelis?");

    // Turn 2 — model answered; sellerType is the next universal blocker (ahead of price).
    const t2 = buildSellerContextualVoiceFollowUp(
      "vehicles",
      { make: "BMW", model: "320d" },
      ["price", "sellerType", "city"]
    );
    assert.equal(t2, "Skelbiate kaip privatus asmuo ar kaip įmonė?");

    // Turn 3 — sellerType answered; city is the remaining blocker.
    const t3 = buildSellerContextualVoiceFollowUp(
      "vehicles",
      { make: "BMW", model: "320d", sellerType: "private" },
      ["price", "city"]
    );
    assert.equal(t3, "Kurį miestą rodyti pirkėjams skelbime?");

    // Turn 4 — city answered; price is next.
    const t4 = buildSellerContextualVoiceFollowUp(
      "vehicles",
      { make: "BMW", model: "320d", sellerType: "private" },
      ["price"]
    );
    assert.equal(
      t4,
      "Kokią kainą nustatome eurais — norite greitesnio pardavimo ar aukštesnės kainos?"
    );

    // Turn 5 — price answered; mileage (high-value enrichment) is next.
    const t5 = buildSellerContextualVoiceFollowUp(
      "vehicles",
      { make: "BMW", model: "320d", sellerType: "private" },
      []
    );
    assert.equal(t5, "Kokia automobilio rida (km)?");

    // No field appeared twice across the whole conversation.
    const asked = [t1, t2, t3, t4, t5];
    assert.equal(new Set(asked).size, asked.length);
  });

  it("falls back to the legacy universal sequencing only for a category the policy does not recognize", () => {
    const reply = buildSellerContextualVoiceFollowUp("some_unmapped_category", {}, ["city"]);
    assert.equal(reply, "Kurį miestą rodyti pirkėjams skelbime?");
  });

  it("returns null when the policy and all universal blockers/price are satisfied", () => {
    const reply = buildSellerContextualVoiceFollowUp(
      "vehicles",
      {
        make: "Ford",
        model: "Focus",
        mileage: "150000",
        year: "2016",
        techInspection: "2025-01",
        transmission: "Mechaninė",
        fuelType: "Benzinas",
      },
      []
    );
    assert.equal(reply, null);
  });
});

describe("Phase 2B — live integration: buildDraftReadyChatReply", () => {
  it("surfaces the model gap (not mileage) for a vehicle draft missing only its model — independently specified", () => {
    const draft = {
      title: "BMW 320d",
      price: 15000,
      location: "Vilnius",
      category: "vehicles",
      attributes: { make: "BMW", sellerType: "private" },
    };
    const reply = buildDraftReadyChatReply(draft);
    assert.match(reply, /Jei turite, parašykite: tikslų modelį —/);
  });

  it("surfaces exactly one mileage gap once make/model/blockers/price are known", () => {
    const draft = {
      title: "BMW 320d",
      price: 15000,
      location: "Vilnius",
      category: "vehicles",
      attributes: { make: "BMW", model: "320d", sellerType: "private" },
    };
    const reply = buildDraftReadyChatReply(draft);
    assert.match(reply, /Jei turite, parašykite: ridą \(km\) —/);
  });

  it("surfaces the sellerType blocker gap when it is the only missing fact", () => {
    const draft = {
      title: "BMW 320d",
      price: 15000,
      location: "Vilnius",
      category: "vehicles",
      attributes: {
        make: "BMW",
        model: "320d",
        mileage: "150000",
        year: "2016",
        techInspection: "2025-01",
        transmission: "Automatinė",
        fuelType: "Dyzelinas",
        // sellerType intentionally missing
      },
    };
    const reply = buildDraftReadyChatReply(draft);
    assert.match(reply, /Jei turite, parašykite: ar skelbiate kaip privatus asmuo, ar kaip įmonė —/);
  });

  it("surfaces the city blocker gap when location is empty and everything else is known", () => {
    const draft = {
      title: "BMW 320d",
      price: 15000,
      location: "",
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
    assert.match(reply, /Jei turite, parašykite: miestą —/);
  });

  it("produces zero follow-up gaps once the policy and blockers have nothing left to ask", () => {
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
    assert.doesNotMatch(reply, /Jei turite, parašykite:/);
    assert.match(reply, /PrePublish kortelėje/);
  });

  it("surfaces the year-conflict gap (not silent overwrite, not a repeat) when attributes carry a flagged conflict", () => {
    const draft = {
      title: "Audi A4",
      price: 9000,
      location: "Vilnius",
      category: "vehicles",
      attributes: {
        make: "Audi",
        model: "A4",
        sellerType: "private",
        mileage: "120000",
        year: "2015",
        yearConflict: "true",
        yearConflictCandidate: "2018",
        techInspection: "2025-06",
        transmission: "Mechaninė",
        fuelType: "Dyzelinas",
      },
    };
    const reply = buildDraftReadyChatReply(draft);
    assert.match(
      reply,
      /Jei turite, parašykite: kuriuos pagaminimo metus laikyti teisingais —/
    );
  });
});
