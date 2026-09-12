/**
 * Finding C — non-transport multimodal path (BLOCKER 5 delta).
 *
 * Proves the exported image/listing extraction path (parseListingImagesForAgent →
 * runTwoPassListingGeneration mode=image) resolves a NON-TRANSPORT vertical through:
 *   category → schema resolution → schema-guided extraction (schema hint in the image
 *   prompt) → normalized canonical attributes.
 *
 * The model is STUBBED (no real-model eval). This is an architecture proof, not the
 * future real-model evaluation gate.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { parseListingImagesForAgent } from "../vauto-unified.js";

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

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
    const promptText = (body.contents ?? [])
      .flatMap((c) => c.parts ?? [])
      .map((p) => p.text ?? "")
      .join("\n");
    prompts.push(promptText);
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

describe("Finding C — non-transport multimodal extraction path", () => {
  it("ELECTRONICS image: schema hint in prompt → normalized canonical attributes", async () => {
    const captured = installCapturingFetch({
      pass1: {
        intent: "sell",
        category: "ELEKTRONIKA",
        technicalFields: {
          manufacturer: "Apple",
          deviceModel: "iPhone 13 Pro",
          condition: "naudotas",
          storage: "256 GB",
          warranty: "Yra",
          bodyType: "universalas",
        },
        confidence: 0.9,
      },
      pass2: {
        title: "iPhone 13 Pro 256 GB",
        description: "Parduodamas iPhone 13 Pro 256 GB, naudotas, su garantija.",
      },
    });
    process.env.GEMINI_API_KEY = "finding-c-multimodal-test-key";
    try {
      const res = await parseListingImagesForAgent({
        imageDataUrls: [TINY_PNG],
        userCity: "Vilnius",
        text: "iPhone 13 Pro 256 GB",
      });

      // The image extraction prompt actually carries the canonical schema hint.
      assert.match(
        captured.prompts[0] ?? "",
        /KATEGORIJOS STRUKTŪRA/,
        "image extraction prompt must carry the schema hint"
      );
      assert.match(captured.prompts[0] ?? "", /manufacturer\(string\)/);
      assert.match(captured.prompts[0] ?? "", /storage\(enum: 64 GB\|128 GB\|256 GB\|512 GB\|1 TB\)/);

      const attrs = (res.listing.attributes ?? {}) as Record<string, string>;
      assert.equal(res.listing.category, "electronics");
      assert.equal(attrs.manufacturer, "Apple");
      assert.equal(attrs.deviceModel, "iPhone 13 Pro");
      assert.equal(attrs.condition, "Naudotas");
      assert.equal(attrs.storage, "256 GB");
      assert.equal(attrs.warranty, "Yra");
      assert.equal(attrs.bodyType, undefined, "vehicle enrichment key must not leak into electronics");
    } finally {
      captured.restore();
    }
  });
});
