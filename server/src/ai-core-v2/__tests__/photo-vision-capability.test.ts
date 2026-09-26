/**
 * Core v2 — Photo / Vision capability & multimodal integration test.
 *
 * Verifies:
 * 1. createBuyerRegistry exposes analyzePhoto capability.
 * 2. Missing vision provider fails closed with unavailable (no fabricated vision facts).
 * 3. Neutral attachment context fact is passed to reasoning provider.
 * 4. Model can semantically select analyzePhoto and prepareListingDraft.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createBuyerRegistry, runBuyerTurn, type BuyerSession } from "../journey/conversation.js";
import { CapabilityRegistry } from "../capability/registry.js";
import { analyzePhotoCapability } from "../capability/capabilities/analyze-photo.js";
import { prepareListingDraftCapability } from "../capability/capabilities/prepare-listing-draft.js";
import { emptyMarketplaceState } from "../state/marketplace-state.js";
import { EMPTY_RESULT_CONTEXT } from "../journey/result-context.js";
import { deterministicAuthorityVerifier } from "../loop/authority-verifier.js";
import type { ReasoningProvider } from "../reasoning/reasoning-contract.js";

describe("Core v2 — Photo / Vision capability integration", () => {
  it("createBuyerRegistry registers canonical analyzePhoto capability", () => {
    const registry = createBuyerRegistry(EMPTY_RESULT_CONTEXT);
    const descriptions = registry.describe();
    const analyzeCap = descriptions.find((c) => c.name === "analyzePhoto");
    assert.ok(analyzeCap, "analyzePhoto capability must be registered in createBuyerRegistry");
    assert.strictEqual(analyzeCap?.operation, "READ");
  });

  it("analyzePhoto capability fails gracefully when no images are in context", async () => {
    const result = await analyzePhotoCapability.execute({}, { pendingImageUrls: [] });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.failureKind, "not_found");
  });

  it("missing vision provider returns truthful unavailable error with no fabricated vision facts", async () => {
    // When hasAiKey() is false (e.g. GEMINI_API_KEY missing in unit test env)
    const result = await analyzePhotoCapability.execute({}, { pendingImageUrls: ["data:image/jpeg;base64,abc"] });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.failureKind, "unavailable");
    assert.strictEqual(result.data, undefined, "Must NOT return fabricated vision data");
    assert.ok(result.error?.includes("unavailable"));
  });

  it("buyer turn passes neutral attachment context fact and allows model to semantically select analyzePhoto", async () => {
    const session: BuyerSession = {
      state: emptyMarketplaceState(),
      history: [],
      resultContext: EMPTY_RESULT_CONTEXT,
    };

    let step = 0;
    let receivedUserTurn = "";

    const mockProvider: ReasoningProvider = async (input) => {
      step += 1;
      receivedUserTurn = input.userTurn;
      if (step === 1) {
        // Step 1: LLM sees neutral multimodal attachment fact in userTurn, semantically selects analyzePhoto
        return {
          capabilityRequest: {
            capability: "analyzePhoto",
            args: {},
          },
        };
      }
      if (step === 2) {
        // Step 2: LLM receives analyzePhoto result (unavailable in test env without GEMINI_API_KEY)
        const visionRes = input.groundedResults?.find((g) => g.capability === "analyzePhoto");
        assert.ok(visionRes, "Grounded analyzePhoto capability call result must be returned to LLM");
        return {
          text: "Matau įkeltą nuotrauką, bet AI vizualinis analitikas šiuo metu nepasiekiamas. Papasakokite apie parduodamą daiktą.",
        };
      }
      return { text: "Supratau." };
    };

    const turnRecord = await runBuyerTurn(
      session,
      "[nuotraukos įkeltos]\n[Vartotojas įkėlė 1 nuotrauką(-as)]",
      {
        provider: mockProvider,
        verifier: deterministicAuthorityVerifier,
        capabilityContext: {
          pendingImageUrls: ["data:image/jpeg;base64,mockImageBytes"],
        },
      }
    );

    assert.ok(receivedUserTurn.includes("[Vartotojas įkėlė 1 nuotrauką(-as)]"), "Neutral attachment fact must be present in user turn");
    const photoCall = turnRecord.capabilityCalls.find((c) => c.name === "analyzePhoto");
    assert.ok(photoCall, "analyzePhoto capability must have been semantically selected");
  });

  it("functional photo → analyze → draft path executes end-to-end with Vision facts", async () => {
    const session: BuyerSession = {
      state: emptyMarketplaceState(),
      history: [],
      resultContext: EMPTY_RESULT_CONTEXT,
    };

    // Mock capability execution returning VISION_DERIVED facts
    const mockRegistry = new CapabilityRegistry();
    mockRegistry.register({
      ...analyzePhotoCapability,
      execute: async () => ({
        ok: true,
        provenance: "VISION_DERIVED",
        data: {
          detectedObjects: ["Citroën Grand C4 Picasso"],
          choiceChips: ["Parduoti Citroën Grand C4 Picasso"],
          category: "vehicles",
          titleCandidate: "Citroën Grand C4 Picasso 2013",
          descriptionCandidate: "Tvarkingas šeimos vienatūris",
          price: 4500,
          attributes: { make: "Citroën", model: "Grand C4 Picasso", year: "2013" },
        },
      }),
    });
    mockRegistry.register(prepareListingDraftCapability);

    let step = 0;
    const mockProvider: ReasoningProvider = async (input) => {
      step += 1;
      if (step === 1) {
        return {
          capabilityRequest: { capability: "analyzePhoto", args: {} },
        };
      }
      if (step === 2) {
        const visionRes = input.groundedResults?.find((g) => g.capability === "analyzePhoto");
        assert.strictEqual(visionRes?.provenance, "VISION_DERIVED");
        return {
          text: "Nuotraukoje matomas 2013 m. Citroën Grand C4 Picasso. Paruošiau skelbimo juodraštį.",
          capabilityRequest: {
            capability: "prepareListingDraft",
            args: {
              title: "Citroën Grand C4 Picasso 2013",
              category: "vehicles",
              price: 4500,
              city: "Vilnius",
              attributes: { make: "Citroën", model: "Grand C4 Picasso", year: "2013" },
            },
          },
        };
      }
      return { text: "Nuotraukoje matomas 2013 m. Citroën Grand C4 Picasso." };
    };

    const turnRecord = await runBuyerTurn(
      session,
      "[nuotraukos įkeltos]\n[Vartotojas įkėlė 1 nuotrauką(-as)]",
      {
        provider: mockProvider,
        verifier: deterministicAuthorityVerifier,
        buildRegistry: () => mockRegistry,
        capabilityContext: {
          pendingImageUrls: ["data:image/jpeg;base64,mockImageBytes"],
        },
      }
    );

    assert.ok(turnRecord.assistantText.includes("Citroën Grand C4 Picasso"));
    const photoCall = turnRecord.capabilityCalls.find((c) => c.name === "analyzePhoto");
    assert.strictEqual(photoCall?.ok, true);
    const draftCall = turnRecord.capabilityCalls.find((c) => c.name === "prepareListingDraft");
    assert.strictEqual(draftCall?.ok, true);
  });
});
