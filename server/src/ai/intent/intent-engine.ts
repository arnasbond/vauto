/**
 * VAUTO Universal Intent Engine (Etapas 10A).
 *
 * HARD RULES:
 * - 0 action execution (no DB search, no listing create).
 * - FAST model route only via getAiModel("FAST") — never hardcode model names.
 * - LLM JSON must pass Zod; low confidence → UNKNOWN / abstain / confirmation.
 * - Telemetry: metadata only (no raw prompt / PII / response body).
 */

import {
  AI_FOUNDATION_VERSION,
  applyConfidencePolicy,
  getAiModel,
  normalizeLithuanianDomainText,
  recordAiTelemetry,
  type AiModelRoute,
} from "../foundation/index.js";
import { classifyIntentRules } from "./intent-rules.js";
import {
  boundIntentEntities,
  parseIntentLlmPayload,
  parseIntentResult,
  type IntentEntities,
  type IntentResult,
  type VautoIntent,
} from "./intent-schema.js";

export type IntentInput = {
  /** Raw user text or STT transcript. */
  text: string;
  /** Optional request correlation id (safe). */
  requestId?: string;
  /**
   * Optional FAST-class LLM caller. Must return JSON-compatible object.
   * Model id is supplied by the engine from getAiModel("FAST") — callers must not pick models.
   */
  llmCaller?: IntentFastLlmCaller | null;
};

export type IntentFastLlmCaller = (args: {
  route: AiModelRoute;
  /** Opaque instruction id — not user content for logs. */
  systemId: string;
  /** User content for the model only — NEVER write this to telemetry. */
  userText: string;
}) => Promise<unknown>;

export type ClassifyIntentOptions = IntentInput & {
  /** When true (default), resolve FAST route even for rules-only path (telemetry). */
  resolveRoute?: boolean;
};

const INTENT_SYSTEM_ID = "vauto.intent.v1";

function buildNormalizedWorkingText(
  original: string,
  domainOriginal: string
): string {
  // Working text stays close to original; domain attrs applied separately.
  // Preserve original spelling in IntentResult.originalText always.
  return domainOriginal.trim();
}

function toIntentResult(args: {
  originalText: string;
  normalizedText: string;
  intent: VautoIntent;
  confidence: number;
  entities: IntentEntities;
  missing: string[];
  reasonCode: string;
  route: AiModelRoute | null;
  forceUnknown?: boolean;
}): IntentResult {
  let intent = args.forceUnknown ? "UNKNOWN" : args.intent;
  let confidence = args.confidence;
  let entities = boundIntentEntities(args.entities);
  let missing = [...args.missing];

  if (intent !== "UNKNOWN") {
    const policy = applyConfidencePolicy(entities, confidence, {
      reason: args.reasonCode,
    });
    if (policy.abstained) {
      intent = "UNKNOWN";
      confidence = policy.confidence;
      entities = {};
      missing = ["confirmation"];
      const draft: IntentResult = {
        intent,
        confidence,
        entities,
        missing,
        requiresConfirmation: true,
        abstained: true,
        reasonCode: policy.reason.includes("abstain")
          ? "low_confidence_abstain"
          : args.reasonCode,
        originalText: args.originalText,
        normalizedText: args.normalizedText,
        foundationVersion: AI_FOUNDATION_VERSION,
        modelRoute: args.route
          ? {
              taskClass: "FAST",
              provider: String(args.route.provider),
              model: args.route.model,
              fallbackUsed: args.route.fallbackUsed,
            }
          : undefined,
      };
      return parseIntentResult(draft);
    }

    const draft: IntentResult = {
      intent,
      confidence: policy.confidence,
      entities: boundIntentEntities(policy.value ?? {}),
      missing,
      requiresConfirmation: policy.requiresUserConfirmation || missing.length > 0,
      abstained: false,
      reasonCode: args.reasonCode,
      originalText: args.originalText,
      normalizedText: args.normalizedText,
      foundationVersion: AI_FOUNDATION_VERSION,
      modelRoute: args.route
        ? {
            taskClass: "FAST",
            provider: String(args.route.provider),
            model: args.route.model,
            fallbackUsed: args.route.fallbackUsed,
          }
        : undefined,
    };
    return parseIntentResult(draft);
  }

  const draft: IntentResult = {
    intent: "UNKNOWN",
    confidence,
    entities: {},
    missing: missing.length ? missing : ["intent"],
    requiresConfirmation: true,
    abstained: confidence < 0.7,
    reasonCode: args.reasonCode,
    originalText: args.originalText,
    normalizedText: args.normalizedText,
    foundationVersion: AI_FOUNDATION_VERSION,
    modelRoute: args.route
      ? {
          taskClass: "FAST",
          provider: String(args.route.provider),
          model: args.route.model,
          fallbackUsed: args.route.fallbackUsed,
        }
      : undefined,
  };
  return parseIntentResult(draft);
}

/**
 * Classify user text / STT transcript into a validated IntentResult.
 * Does NOT execute marketplace actions.
 */
export async function classifyIntent(
  input: ClassifyIntentOptions
): Promise<IntentResult> {
  const started = Date.now();
  const originalText = String(input.text ?? "").slice(0, 4000);
  let route: AiModelRoute | null = null;
  let fallbackUsed = false;
  let errorCode: string | null = null;
  let success = true;
  let usedLlm = false;

  try {
    if (input.resolveRoute !== false) {
      try {
        route = getAiModel("FAST");
        fallbackUsed = route.fallbackUsed;
      } catch {
        route = null;
        errorCode = "fast_model_unconfigured";
      }
    }

    const domain = normalizeLithuanianDomainText(originalText);
    const normalizedText = buildNormalizedWorkingText(
      originalText,
      domain.originalText
    );
    const rules = classifyIntentRules(normalizedText, domain);

    let intent = rules.intent;
    let confidence = rules.confidence;
    let entities = rules.entities;
    let missing = rules.missing;
    let reasonCode = rules.reasonCode;

    if (rules.adversarial) {
      const result = toIntentResult({
        originalText,
        normalizedText,
        intent: "UNKNOWN",
        confidence: 0.2,
        entities: {},
        missing: ["intent"],
        reasonCode: "adversarial_prompt",
        route,
        forceUnknown: true,
      });
      recordAiTelemetry({
        requestId: input.requestId,
        taskType: "intent.classify",
        taskClass: "FAST",
        provider: route?.provider ?? "unknown",
        model: route?.model ?? "unconfigured",
        latencyMs: Date.now() - started,
        success: true,
        fallbackUsed,
        abstained: result.abstained,
        errorCode: "adversarial_prompt",
      });
      return result;
    }

    // Optional FAST LLM refinement — Zod required; never trust raw JSON.
    if (input.llmCaller && route) {
      usedLlm = true;
      try {
        const raw = await input.llmCaller({
          route,
          systemId: INTENT_SYSTEM_ID,
          userText: normalizedText,
        });
        const llm = parseIntentLlmPayload(raw);
        // Prompt-injection: never allow LLM to invent non-schema intents (Zod already enforces).
        // Prefer LLM only when rules are weak or agree.
        if (
          rules.intent === "UNKNOWN" ||
          llm.intent === rules.intent ||
          llm.confidence >= 0.9
        ) {
          intent = llm.intent;
          confidence = Math.min(llm.confidence, rules.adversarial ? 0.2 : llm.confidence);
          entities = { ...entities, ...llm.entities };
          missing = llm.missing?.length ? llm.missing : missing;
          reasonCode = llm.reasonCode ?? "llm_fast_validated";
        } else {
          reasonCode = "llm_disagrees_keep_rules";
        }
      } catch {
        errorCode = "llm_schema_invalid";
        // Keep deterministic rules — never fail open into actions.
      }
    }

    const result = toIntentResult({
      originalText,
      normalizedText,
      intent,
      confidence,
      entities,
      missing,
      reasonCode,
      route,
    });

    recordAiTelemetry({
      requestId: input.requestId,
      taskType: "intent.classify",
      taskClass: "FAST",
      provider: route?.provider ?? "rules",
      model: route?.model ?? "rules-only",
      latencyMs: Date.now() - started,
      success: true,
      fallbackUsed: fallbackUsed || usedLlm === false && Boolean(errorCode),
      abstained: result.abstained,
      errorCode,
    });

    return result;
  } catch (err) {
    success = false;
    errorCode = "intent_engine_error";
    recordAiTelemetry({
      requestId: input.requestId,
      taskType: "intent.classify",
      taskClass: "FAST",
      provider: route?.provider ?? "unknown",
      model: route?.model ?? "unconfigured",
      latencyMs: Date.now() - started,
      success,
      fallbackUsed,
      abstained: true,
      errorCode,
    });
    return parseIntentResult({
      intent: "UNKNOWN",
      confidence: 0,
      entities: {},
      missing: ["intent"],
      requiresConfirmation: true,
      abstained: true,
      reasonCode: "engine_error",
      originalText,
      normalizedText: originalText,
      foundationVersion: AI_FOUNDATION_VERSION,
    });
  }
}

/** Explicit guarantee for auditors / tests: this module never executes side effects. */
export const INTENT_ENGINE_ACTION_EXECUTION = false as const;
