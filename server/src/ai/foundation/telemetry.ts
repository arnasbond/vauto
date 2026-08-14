/**
 * VAUTO AI Foundation — privacy-safe telemetry / observability.
 * NEVER log prompts, OCR text, phones, emails, or other PII in production records.
 */

import type { AiProviderId, AiTaskClass } from "./model-router.js";
import { AI_FOUNDATION_VERSION } from "./version.js";

export type AiTelemetryEvent = {
  requestId: string;
  foundationVersion: string;
  taskType: string;
  taskClass: AiTaskClass;
  provider: AiProviderId | string;
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCost: number | null;
  success: boolean;
  fallbackUsed: boolean;
  abstained: boolean;
  errorCode: string | null;
  /** ISO timestamp */
  at: string;
};

export type RecordAiTelemetryInput = {
  requestId?: string;
  taskType: string;
  taskClass: AiTaskClass;
  provider: AiProviderId | string;
  model: string;
  latencyMs: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCost?: number | null;
  success: boolean;
  fallbackUsed?: boolean;
  abstained?: boolean;
  errorCode?: string | null;
};

/** Keys that must never appear in sanitized telemetry payloads. */
export const AI_TELEMETRY_FORBIDDEN_KEYS = [
  "prompt",
  "systemPrompt",
  "system_instruction",
  "messages",
  "body",
  "inputText",
  "userText",
  "ocr",
  "ocrText",
  "rawText",
  "phone",
  "email",
  "pii",
  "imageBase64",
  "base64",
] as const;

const FORBIDDEN_KEY_SET = new Set(
  AI_TELEMETRY_FORBIDDEN_KEYS.map((k) => k.toLowerCase())
);

function newRequestId(): string {
  return `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Strip forbidden / PII-looking fields from an arbitrary object before logging.
 * Used defensively if callers accidentally pass extra bags.
 */
export function sanitizeAiTelemetryPayload(
  input: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (FORBIDDEN_KEY_SET.has(key.toLowerCase())) continue;
    if (typeof value === "string") {
      // Drop long free-text that looks like user content (>240 chars) unless whitelisted key
      const safeShortKeys = new Set([
        "requestid",
        "foundationversion",
        "tasktype",
        "taskclass",
        "provider",
        "model",
        "errorcode",
        "at",
      ]);
      if (!safeShortKeys.has(key.toLowerCase()) && value.length > 240) continue;
      // Redact obvious contact patterns if somehow present on allowed keys
      if (/(?:\+?\d[\d\s-]{7,}\d)|(?:[^\s@]+@[^\s@]+\.[^\s@]+)/.test(value)) {
        out[key] = "[REDACTED]";
        continue;
      }
    }
    out[key] = value;
  }
  return out;
}

export type AiTelemetrySink = (event: AiTelemetryEvent) => void;

let sink: AiTelemetrySink = (event) => {
  // Structured one-line log — aggregate metrics only
  console.info(`[ai-telemetry] ${JSON.stringify(event)}`);
};

/** Override sink (tests / future exporters). */
export function setAiTelemetrySink(next: AiTelemetrySink | null): void {
  sink =
    next ??
    ((event) => {
      console.info(`[ai-telemetry] ${JSON.stringify(event)}`);
    });
}

export function recordAiTelemetry(
  input: RecordAiTelemetryInput
): AiTelemetryEvent {
  const event: AiTelemetryEvent = {
    requestId: input.requestId?.trim() || newRequestId(),
    foundationVersion: AI_FOUNDATION_VERSION,
    taskType: String(input.taskType || "unknown").slice(0, 120),
    taskClass: input.taskClass,
    provider: input.provider,
    model: String(input.model || "").slice(0, 120),
    latencyMs: Math.max(0, Math.round(Number(input.latencyMs) || 0)),
    inputTokens:
      input.inputTokens == null ? null : Math.max(0, Math.round(input.inputTokens)),
    outputTokens:
      input.outputTokens == null
        ? null
        : Math.max(0, Math.round(input.outputTokens)),
    estimatedCost:
      input.estimatedCost == null ? null : Number(input.estimatedCost),
    success: Boolean(input.success),
    fallbackUsed: Boolean(input.fallbackUsed),
    abstained: Boolean(input.abstained),
    errorCode: input.errorCode ? String(input.errorCode).slice(0, 80) : null,
    at: new Date().toISOString(),
  };

  const safe = sanitizeAiTelemetryPayload(
    event as unknown as Record<string, unknown>
  ) as unknown as AiTelemetryEvent;

  sink(safe);
  return safe;
}
