/**
 * R4.1 remediation — PRODUCER → ROUND TRIP → CONSUMER.
 *
 * These tests prove the real production correction path (updateListingDraft)
 * MINTS the human-authority marker from explicit user text, and the real
 * vision merge CONSUMES it — so a later photo cannot silently overwrite an
 * explicit human correction. They do NOT manually seed the marker.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeAgentTool, type AgentToolContext } from "../agent-tools.js";
import {
  mergeFieldAuthorityAttrs,
  isFieldUserCorrected,
  USER_CORRECTED_FIELDS_KEY,
} from "../../shared/field-authority.js";
import {
  resolveDescriptionPublishDecision,
  signHumanConfirmedDescription,
} from "../../shared/description-provenance.js";

type Draft = {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
  category?: string;
  attributes?: Record<string, string>;
};

function draftOf(r: { sideEffect?: unknown }): Draft {
  const se = r.sideEffect as { type: string; listingDraft: Draft } | undefined;
  assert.equal(se?.type, "listing_draft");
  return se!.listingDraft;
}

function ctxWith(listingDraft: Draft, lastUserQuery: string): AgentToolContext {
  return {
    userCity: "Vilnius",
    userRole: "seller",
    contact: "",
    listingDraft,
    lastUserQuery,
  };
}

const PHOTO_DRAFT: Draft = {
  title: "Juoda striukė",
  description: "",
  price: 0,
  location: "Vilnius",
  category: "clothing",
  attributes: { color: "juoda" },
};

describe("R4.1 remediation — updateListingDraft MINTS authority from user text", () => {
  it("Scenario B: explicit user price 'Kaina 8900' is marked human-authoritative", async () => {
    const r = await executeAgentTool(
      "updateListingDraft",
      { price: 999 },
      ctxWith(PHOTO_DRAFT, "Kaina 8900")
    );
    const draft = draftOf(r);
    assert.equal(draft.price, 8900, "user text wins over model price");
    assert.equal(
      isFieldUserCorrected(draft.attributes, "price"),
      true,
      "price is marked user-corrected"
    );
  });

  it("Scenario A: grounded color 'tamsiai mėlyna' is marked human-authoritative", async () => {
    const r = await executeAgentTool(
      "updateListingDraft",
      { attributes: { color: "tamsiai mėlyna" } },
      ctxWith(PHOTO_DRAFT, "Ne, ji tamsiai mėlyna")
    );
    const draft = draftOf(r);
    assert.equal(
      isFieldUserCorrected(draft.attributes, "color"),
      true,
      "color is marked user-corrected"
    );
  });

  it("Scenario C: explicit category change is marked human-authoritative", async () => {
    const r = await executeAgentTool(
      "updateListingDraft",
      { category: "electronics" },
      ctxWith(PHOTO_DRAFT, "Tai ne drabužis, o elektronika")
    );
    const draft = draftOf(r);
    assert.equal(
      isFieldUserCorrected(draft.attributes, "category"),
      true,
      "category is marked user-corrected"
    );
  });

  it("Scenario D: description edit becomes USER_CORRECTION and invalidates confirmation", async () => {
    const r = await executeAgentTool(
      "updateListingDraft",
      { description: "Naujas aprašymas" },
      ctxWith(
        {
          ...PHOTO_DRAFT,
          description: "Senas aprašymas",
          attributes: {
            ...PHOTO_DRAFT.attributes,
            descriptionSource: "MODEL_INFERENCE",
            confirmationToken: "stale-confirmation",
          },
        },
        "Aprašymas: Naujas aprašymas"
      )
    );
    const draft = draftOf(r);
    assert.equal(draft.attributes?.descriptionSource, "USER_CORRECTION");
    assert.equal(draft.attributes?.confirmationToken, undefined);
    assert.equal(
      isFieldUserCorrected(draft.attributes, "description"),
      true
    );
  });

  it("model cannot inject its own userCorrectedFields authority", async () => {
    const r = await executeAgentTool(
      "updateListingDraft",
      { attributes: { [USER_CORRECTED_FIELDS_KEY]: "price|color" } },
      ctxWith(PHOTO_DRAFT, "patikslink")
    );
    const draft = draftOf(r);
    const marker = draft.attributes?.[USER_CORRECTED_FIELDS_KEY];
    assert.ok(
      marker === undefined || marker === "",
      "model-injected marker must be stripped"
    );
  });
});

describe("R4.1 HIGH remediation — description provenance (R2.7 publication invariant)", () => {
  const USER_DESC = "Mano rankomis parašytas aprašymas";
  const MODEL_DESC =
    "Parduodamas puikios būklės telefonas su dėklu ir įkrovikliu, be įbrėžimų.";

  it("A. user-authored (grounded) description → USER_CORRECTION, no artifacts, publish accepted", async () => {
    const r = await executeAgentTool(
      "updateListingDraft",
      { description: USER_DESC },
      ctxWith(PHOTO_DRAFT, `Parašyk aprašymą: ${USER_DESC}`)
    );
    const draft = draftOf(r);
    assert.equal(draft.attributes?.descriptionSource, "USER_CORRECTION");
    assert.equal(draft.attributes?.confirmationToken, undefined);
    assert.equal(draft.attributes?.provenanceToken, undefined);
    assert.equal(
      resolveDescriptionPublishDecision(draft.description!, undefined, undefined),
      "accept",
      "manual/user-authored description publishes without AI confirmation"
    );
  });

  it("B. model-generated (ungrounded) description → MODEL_INFERENCE + provenance, publish rejected", async () => {
    const r = await executeAgentTool(
      "updateListingDraft",
      { description: MODEL_DESC },
      ctxWith(PHOTO_DRAFT, "patikslink aprašymą")
    );
    const draft = draftOf(r);
    assert.equal(draft.attributes?.descriptionSource, "MODEL_INFERENCE");
    assert.equal(draft.attributes?.confirmationToken, undefined);
    const token = draft.attributes?.provenanceToken;
    assert.ok(token, "provenance token must be minted");
    assert.equal(
      resolveDescriptionPublishDecision(draft.description!, token, undefined),
      "reject_unpromoted",
      "unconfirmed model prose must be rejected"
    );
  });

  it("C. stale/tampered provenance → reject_invalid", async () => {
    const r = await executeAgentTool(
      "updateListingDraft",
      { description: MODEL_DESC },
      ctxWith(PHOTO_DRAFT, "patikslink aprašymą")
    );
    const draft = draftOf(r);
    const token = draft.attributes?.provenanceToken as string;
    assert.equal(
      resolveDescriptionPublishDecision(draft.description! + ".", token, undefined),
      "reject_invalid",
      "tampered text with stale token must be rejected"
    );
  });

  it("D. explicitly confirmed model proposal → accept (HUMAN_CONFIRMED path)", async () => {
    const r = await executeAgentTool(
      "updateListingDraft",
      { description: MODEL_DESC },
      ctxWith(PHOTO_DRAFT, "patikslink aprašymą")
    );
    const draft = draftOf(r);
    const conf = signHumanConfirmedDescription(draft.description!);
    assert.equal(
      resolveDescriptionPublishDecision(draft.description!, undefined, conf),
      "accept",
      "explicit human confirmation still accepts"
    );
  });
});

describe("R4.1 remediation — PRODUCER → CONSUMER (photo → correction → photo)", () => {
  it("color correction survives a later vision merge; new evidence is added", async () => {
    // Turn 1: vision produced "juoda".
    // Turn 2: user corrects to "tamsiai mėlyna" → producer mints the marker.
    const corrected = await executeAgentTool(
      "updateListingDraft",
      { attributes: { color: "tamsiai mėlyna" } },
      ctxWith(PHOTO_DRAFT, "Ne, ji tamsiai mėlyna")
    );
    const correctedDraft = draftOf(corrected);

    // Turn 3: a later photo's vision disagrees and adds new evidence.
    const merged = mergeFieldAuthorityAttrs(
      correctedDraft.attributes ?? {},
      { color: "juoda", material: "vilna" },
      "VISUAL_OBSERVATION"
    );
    assert.equal(merged.color, "tamsiai mėlyna", "human color survives");
    assert.equal(merged.material, "vilna", "new non-conflicting evidence added");
  });

  it("price correction is visible to the top-level field protector", async () => {
    const corrected = await executeAgentTool(
      "updateListingDraft",
      { price: 999 },
      ctxWith(PHOTO_DRAFT, "Kaina 8900")
    );
    const draft = draftOf(corrected);
    // The vision merge (chat-media-upload) protects `price` via this exact check.
    assert.equal(isFieldUserCorrected(draft.attributes, "price"), true);
  });
});
