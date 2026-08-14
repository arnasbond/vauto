import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_TELEMETRY_FORBIDDEN_KEYS,
  recordAiTelemetry,
  sanitizeAiTelemetryPayload,
  setAiTelemetrySink,
  type AiTelemetryEvent,
} from "./telemetry.js";

describe("AI foundation telemetry", () => {
  it("records aggregate fields without accepting prompt/PII bags", () => {
    const captured: AiTelemetryEvent[] = [];
    setAiTelemetrySink((e) => {
      captured.push(e);
    });

    try {
      const event = recordAiTelemetry({
        requestId: "req_test_1",
        taskType: "foundation.smoke",
        taskClass: "FAST",
        provider: "gemini",
        model: "env-configured-model",
        latencyMs: 123,
        inputTokens: 10,
        outputTokens: 20,
        estimatedCost: 0.001,
        success: true,
        fallbackUsed: false,
        abstained: false,
      });

      assert.equal(event.requestId, "req_test_1");
      assert.equal(event.taskType, "foundation.smoke");
      assert.equal(event.latencyMs, 123);
      assert.equal(event.success, true);
      assert.equal(captured.length, 1);

      const json = JSON.stringify(event);
      for (const key of AI_TELEMETRY_FORBIDDEN_KEYS) {
        assert.equal(
          Object.prototype.hasOwnProperty.call(event, key),
          false,
          `event must not contain ${key}`
        );
        assert.ok(!json.includes(`"${key}"`), `json must not include key ${key}`);
      }
      assert.ok(!json.toLowerCase().includes("prompt"));
    } finally {
      setAiTelemetrySink(null);
    }
  });

  it("sanitizer strips forbidden keys and PII-looking strings", () => {
    const cleaned = sanitizeAiTelemetryPayload({
      requestId: "r1",
      taskType: "x",
      prompt: "FULL USER PROMPT SHOULD NEVER LOG",
      ocrText: "OCR DUMP",
      phone: "+37060000000",
      email: "user@example.com",
      notes: "call +37061234567 please",
      model: "m1",
    });

    assert.equal(cleaned.requestId, "r1");
    assert.equal(cleaned.model, "m1");
    assert.equal(cleaned.prompt, undefined);
    assert.equal(cleaned.ocrText, undefined);
    assert.equal(cleaned.phone, undefined);
    assert.equal(cleaned.email, undefined);
    assert.equal(cleaned.notes, "[REDACTED]");
  });
});
