import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inferProviderFromModel,
  resolveAiModel,
} from "./model-router.js";

describe("AI foundation model-router", () => {
  it("selects FAST / VISION / REASONING from env without hardcoding providers in callers", () => {
    const env = {
      AI_MODEL_FAST: "gemini-2.5-flash-lite",
      AI_MODEL_VISION: "gemini-2.5-flash",
      AI_MODEL_REASONING: "claude-sonnet-4",
      AI_MODEL_FALLBACK: "gpt-4.1-mini",
    };

    const fast = resolveAiModel("FAST", { env });
    assert.equal(fast.taskClass, "FAST");
    assert.equal(fast.model, "gemini-2.5-flash-lite");
    assert.equal(fast.provider, "gemini");
    assert.equal(fast.fallbackUsed, false);
    assert.equal(fast.sourceEnv, "AI_MODEL_FAST");

    const vision = resolveAiModel("VISION", { env });
    assert.equal(vision.model, "gemini-2.5-flash");
    assert.equal(vision.provider, "gemini");
    assert.equal(vision.fallbackUsed, false);

    const reasoning = resolveAiModel("REASONING", { env });
    assert.equal(reasoning.model, "claude-sonnet-4");
    assert.equal(reasoning.provider, "anthropic");
    assert.equal(reasoning.fallbackUsed, false);
  });

  it("falls back to AI_MODEL_FALLBACK when primary missing", () => {
    const env = {
      AI_MODEL_FALLBACK: "gpt-4.1-mini",
    };
    const route = resolveAiModel("VISION", { env });
    assert.equal(route.model, "gpt-4.1-mini");
    assert.equal(route.provider, "openai");
    assert.equal(route.fallbackUsed, true);
    assert.equal(route.taskClass, "VISION");
    assert.equal(route.sourceEnv, "AI_MODEL_FALLBACK");
  });

  it("throws when fallback disabled and primary missing", () => {
    assert.throws(
      () => resolveAiModel("FAST", { env: {}, allowFallback: false }),
      /AI_MODEL_FAST/
    );
  });

  it("infers provider family from model id strings", () => {
    assert.equal(inferProviderFromModel("gemini-2.5-flash"), "gemini");
    assert.equal(inferProviderFromModel("gpt-4o"), "openai");
    assert.equal(inferProviderFromModel("claude-3-5-sonnet"), "anthropic");
    assert.equal(inferProviderFromModel("custom-router-v1"), "unknown");
  });
});
