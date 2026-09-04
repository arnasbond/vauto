/**
 * F12/E2E-harness — chat slot retention & condition binding (client side).
 *
 *  1. "should retain sell intent and lock pendingSlot when condition is
 *     requested" — a condition answer after the missing-guide question must
 *     NEVER fall through to the global search classifier.
 *  2. "should route 'Naudota' into listing draft condition instead of
 *     triggering search" — the deterministic draft input parser must bind
 *     condition answers into attributes.condition.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isListingConversationInput,
  isConditionAnswer,
  tryApplyListingChatInput,
} from "@/lib/agent-listing-chat-input";
import { buildConversationalMissingPrompt } from "@/lib/listing-conversational-flow";
import {
  getPendingSlot,
  consumePendingSlot,
  clearPendingSlot,
} from "@/lib/pending-slot";
import type { AiExtractedListing } from "@/lib/types";

function draftWithoutCondition(): AiExtractedListing {
  return {
    category: "electronics",
    title: "USB klaviatūra",
    description: "juoda klaviatūra",
    price: 15,
    location: "Kaišiadorys",
    contact: "+37060000000",
    confidence: 0.9,
    attributes: { color: "juoda" },
  };
}

describe("chat slot retention & condition binding", () => {
  it("should retain sell intent and lock pendingSlot when condition is requested", () => {
    clearPendingSlot();
    buildConversationalMissingPrompt({
      missingAuth: false,
      missingPhoto: false,
      missingCity: false,
      missingPrice: false,
      missingPhone: false,
      missingTitle: false,
      missingCategory: false,
      missingCondition: true,
      activeConflict: null,
    });
    assert.equal(
      getPendingSlot()?.field,
      "condition",
      "the condition question must lock a pending slot"
    );
    // The answer must be conversation input even with NO mounted draft —
    // the slot (not the draft object) carries the sell context.
    const retained = isListingConversationInput("Naudota", {
      hasListingDraft: false,
      sellerFlowActive: false,
    });
    assert.equal(
      retained,
      true,
      "a pending condition question must keep the reply inside the sell flow"
    );
    assert.equal(isConditionAnswer("Naudota"), true);
    consumePendingSlot();
    assert.equal(getPendingSlot(), null);
  });

  it("should route 'Naudota' into listing draft condition instead of triggering search", () => {
    const draft = draftWithoutCondition();
    let applied: Partial<AiExtractedListing> | null = null;
    const result = tryApplyListingChatInput("Naudota", draft, (patch) => {
      applied = patch;
    });
    const bound = applied as Partial<AiExtractedListing> | null;
    assert.ok(bound, "input must bind to the draft");
    const attrs = bound!.attributes as Record<string, string> | undefined;
    assert.ok(attrs, "bound patch must carry attributes");
    assert.equal(
      attrs!.condition,
      "Naudota",
      "'Naudota' must land in attributes.condition (not become a search query)"
    );
    assert.ok(result, "binding must produce a draft-update reply");
  });

  it("short condition synonyms bind canonically", () => {
    const draft = draftWithoutCondition();
    let applied: Partial<AiExtractedListing> | null = null;
    tryApplyListingChatInput("Kaip nauja", draft, (patch) => {
      applied = patch;
    });
    const attrs = (applied as Partial<AiExtractedListing> | null)?.attributes as
      | Record<string, string>
      | undefined;
    assert.equal(attrs?.condition, "Beveik nauja");
  });
});
