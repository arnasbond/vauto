/**
 * Core v2 — Photo / Vision capability & multimodal integration test.
 *
 * Verifies:
 * 1. createBuyerRegistry exposes analyzePhoto capability.
 * 2. analyzePhoto capability extracts VISION_DERIVED or DOCUMENT_DERIVED facts.
 * 3. Core v2 buyer turn can invoke analyzePhoto and prepareListingDraft without regex/keyword routing.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createBuyerRegistry, runBuyerTurn, type BuyerSession } from "../journey/conversation.js";
import { analyzePhotoCapability } from "../capability/capabilities/analyze-photo.js";
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

  it("buyer turn integrates analyzePhoto and prepareListingDraft in a single multi-step turn", async () => {
    const session: BuyerSession = {
      state: emptyMarketplaceState(),
      history: [],
      resultContext: EMPTY_RESULT_CONTEXT,
    };

    let step = 0;
    const mockProvider: ReasoningProvider = async (input) => {
      step += 1;
      if (step === 1) {
        // Step 1: LLM sees image uploaded, calls analyzePhoto
        return {
          capabilityRequest: {
            capability: "analyzePhoto",
            args: {},
          },
        };
      }
      if (step === 2) {
        // Step 2: LLM receives VISION_DERIVED grounded results, calls prepareListingDraft
        const visionRes = input.groundedResults?.find((g) => g.capability === "analyzePhoto");
        assert.ok(visionRes, "Grounded analyzePhoto result must be available to LLM");
        assert.strictEqual(visionRes?.provenance, "VISION_DERIVED");
        return {
          text: "Nuotraukoje matomas Citroën Grand C4 Picasso 2013 m. Paruošiau skelbimo juodraštį.",
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
      return { text: "Nuotraukoje matomas Citroën Grand C4 Picasso 2013 m. Paruošiau skelbimo juodraštį." };
    };

    const turnRecord = await runBuyerTurn(
      session,
      "[nuotraukos įkeltos] (Išanalizuok nuotrauką)",
      {
        provider: mockProvider,
        verifier: deterministicAuthorityVerifier,
        capabilityContext: {
          pendingImageUrls: ["data:image/jpeg;base64,mockImageBytes"],
        },
      }
    );

    assert.ok(turnRecord.assistantText.includes("Citroën Grand C4 Picasso"));
    const photoCall = turnRecord.capabilityCalls.find((c) => c.name === "analyzePhoto");
    assert.ok(photoCall, "analyzePhoto capability must have been executed");
    const draftCall = turnRecord.capabilityCalls.find((c) => c.name === "prepareListingDraft");
    assert.ok(draftCall, "prepareListingDraft capability must have been executed");
    assert.strictEqual(draftCall?.ok, true);
  });
});
