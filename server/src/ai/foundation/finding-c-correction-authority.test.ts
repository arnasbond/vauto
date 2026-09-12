/**
 * Finding C — cross-turn correction authority (BLOCKER 4 delta).
 *
 * Proves Finding C's schema normalization did NOT regress R4.1 authority
 * semantics, on a NON-TRANSPORT vertical (electronics), through the full chain:
 *
 *   AI extracts attribute (stubbed) → user explicitly corrects it (real
 *   updateListingDraft producer mints USER_CORRECTION) → next extraction pass
 *   (stubbed model) disagrees → mergeFieldAuthorityAttrs keeps the human value.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { handleVautoServerAction } from "../vauto-unified.js";
import { executeAgentTool, type AgentToolContext } from "../agent-tools.js";
import {
  mergeFieldAuthorityAttrs,
  isFieldUserCorrected,
} from "../../shared/field-authority.js";

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

type Draft = {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
  category?: string;
  attributes?: Record<string, string>;
};

type CapturedFetch = {
  prompts: string[];
  restore: () => void;
};

function installCapturingFetch(script: {
  pass1: Record<string, unknown>;
  pass2: Record<string, unknown>;
}): CapturedFetch {
  const original = globalThis.fetch;
  const prompts: string[] = [];
  let callIndex = 0;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    if (!url.includes("generativelanguage.googleapis.com")) {
      return original(input, init);
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      contents?: Array<{ parts?: Array<{ text?: string }> }>;
    };
    prompts.push(
      (body.contents ?? [])
        .flatMap((c) => c.parts ?? [])
        .map((p) => p.text ?? "")
        .join("\n")
    );
    const payload = callIndex === 0 ? script.pass1 : script.pass2;
    callIndex += 1;
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;
  return {
    prompts,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

async function extractElectronics(technicalFields: Record<string, unknown>) {
  const captured = installCapturingFetch({
    pass1: {
      intent: "sell",
      category: "ELEKTRONIKA",
      technicalFields,
      confidence: 0.9,
    },
    pass2: {
      title: "iPhone 13 Pro",
      description: "Parduodamas iPhone 13 Pro, puikios būklės.",
    },
  });
  process.env.GEMINI_API_KEY = "finding-c-authority-test-key";
  try {
    const res = await handleVautoServerAction({
      action: "parse_text",
      text: "Parduodu iPhone 13 Pro",
      userCity: "Vilnius",
      contact: "+37060000000",
    });
    assert.ok((res as { ok?: boolean }).ok);
    const listing = (res as { listing?: Draft }).listing ?? {};
    return listing;
  } finally {
    captured.restore();
  }
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

function draftOf(r: { sideEffect?: unknown }): Draft {
  const se = r.sideEffect as { type: string; listingDraft: Draft } | undefined;
  assert.equal(se?.type, "listing_draft");
  return se!.listingDraft;
}

describe("Finding C — cross-turn correction authority (non-transport)", () => {
  it("human 'storage' correction survives a later stubbed extraction pass", async () => {
    // Turn 1 — AI extracts electronics (stubbed model).
    const extracted = await extractElectronics({
      manufacturer: "Apple",
      deviceModel: "iPhone 13 Pro",
      storage: "256 GB",
      condition: "Naudotas",
    });
    assert.equal(extracted.category, "electronics");
    assert.equal(extracted.attributes?.storage, "256 GB");

    // Turn 2 — user explicitly corrects storage via the real producer.
    const corrected = await executeAgentTool(
      "updateListingDraft",
      { attributes: { storage: "128 GB" } },
      ctxWith(extracted, "Ne, atmintis 128 GB")
    );
    const correctedDraft = draftOf(corrected);
    assert.equal(
      correctedDraft.attributes?.storage,
      "128 GB",
      "user text wins over the prior model value"
    );
    assert.equal(
      isFieldUserCorrected(correctedDraft.attributes, "storage"),
      true,
      "storage is marked human-corrected"
    );

    // Turn 3 — a later model pass disagrees and adds new evidence.
    const reextracted = await extractElectronics({
      manufacturer: "Apple",
      deviceModel: "iPhone 13 Pro",
      storage: "512 GB",
      warranty: "Nėra",
    });

    // Turn 4 — the vision-merge consumer must keep the human correction.
    const merged = mergeFieldAuthorityAttrs(
      correctedDraft.attributes ?? {},
      reextracted.attributes ?? {},
      "MODEL_INFERENCE"
    );
    assert.equal(merged.storage, "128 GB", "human correction must not be overwritten");
    assert.equal(merged.warranty, "Nėra", "new non-conflicting evidence is added");
    assert.equal(
      isFieldUserCorrected(merged, "storage"),
      true,
      "authority marker survives the merge"
    );
  });
});
