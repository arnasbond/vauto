/**
 * VAUTO AI Core v2 — Gemini structured-output schema + parser for
 * ReasoningDecision. The model output is UNTRUSTED: parsing is lenient but
 * the multi-step loop validates strictly and never coerces dangerous values.
 */
import type { ReasoningDecision } from "../reasoning/reasoning-contract.js";
import type { StatePatch } from "../state/state-patch.js";
import type { Provenance, ProvenanceSource } from "../state/marketplace-state.js";

/** Gemini `responseSchema` (OpenAPI-style) for the composable decision. */
export const REASONING_DECISION_SCHEMA = {
  type: "object" as const,
  properties: {
    text: { type: "string" as const },
    clarification: { type: "string" as const },
    capabilityRequest: {
      type: "object" as const,
      properties: {
        capability: { type: "string" as const },
        args: { type: "object" as const },
      },
    },
    statePatches: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          op: { type: "string" as const },
          key: { type: "string" as const },
          value: {},
          label: { type: "string" as const },
          goal: { type: "string" as const },
          vertical: { type: "string" as const },
          question: { type: "string" as const },
          evidence: { type: "string" as const },
          provenance: {
            type: "object" as const,
            properties: {
              source: {
                type: "string" as const,
                enum: [
                  "USER_STATED",
                  "MODEL_INFERRED",
                  "TOOL_DERIVED",
                  "VISION_DERIVED",
                  "DOCUMENT_DERIVED",
                ],
              },
              confidence: { type: "number" as const },
            },
          },
        },
      },
    },
  },
};

const PROVENANCE_SOURCES: ReadonlySet<string> = new Set([
  "USER_STATED",
  "MODEL_INFERRED",
  "TOOL_DERIVED",
  "VISION_DERIVED",
  "DOCUMENT_DERIVED",
]);

function parseProvenance(raw: unknown): Provenance {
  const r = (raw ?? {}) as Record<string, unknown>;
  const source = PROVENANCE_SOURCES.has(String(r.source))
    ? (String(r.source) as ProvenanceSource)
    : "MODEL_INFERRED";
  const confidence =
    typeof r.confidence === "number" && Number.isFinite(r.confidence)
      ? Math.min(1, Math.max(0, r.confidence))
      : undefined;
  return { source, ...(confidence != null ? { confidence } : {}), at: new Date().toISOString() };
}

function parsePatch(raw: unknown): StatePatch {
  const r = (raw ?? {}) as Record<string, unknown>;
  const op = String(r.op ?? "");
  switch (op) {
    case "setHard":
      return {
        op,
        key: String(r.key ?? ""),
        value: r.value as string | number,
        provenance: parseProvenance(r.provenance),
        ...(typeof r.evidence === "string" && r.evidence.trim() ? { evidence: r.evidence.trim() } : {}),
      };
    case "removeHard":
      return { op, key: String(r.key ?? "") };
    case "setSearchSubject":
      return {
        op,
        subject: String(r.subject ?? ""),
        provenance: parseProvenance(r.provenance),
        ...(typeof r.evidence === "string" && r.evidence.trim() ? { evidence: r.evidence.trim() } : {}),
      };
    case "removeSearchSubject":
      return { op };
    case "addSoft":
      return { op, label: String(r.label ?? ""), provenance: parseProvenance(r.provenance) };
    case "removeSoft":
      return { op, label: String(r.label ?? "") };
    case "setGoal":
      return { op, goal: String(r.goal ?? "") };
    case "setVertical":
      return { op, vertical: String(r.vertical ?? "") };
    case "addUnresolved":
      return { op, question: String(r.question ?? "") };
    case "resolveUnresolved":
      return { op, question: String(r.question ?? "") };
    default:
      throw new Error(`unknown patch op: ${op}`);
  }
}

/** Parse Gemini JSON output into a ReasoningDecision (validation happens later). */
export function parseReasoningDecision(raw: unknown): ReasoningDecision {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("reasoning output must be an object");
  }
  const r = raw as Record<string, unknown>;
  const decision: ReasoningDecision = {};
  if (typeof r.text === "string" && r.text.trim()) decision.text = r.text.trim();
  if (typeof r.clarification === "string" && r.clarification.trim()) {
    decision.clarification = r.clarification.trim();
  }
  if (r.capabilityRequest && typeof r.capabilityRequest === "object") {
    const cr = r.capabilityRequest as Record<string, unknown>;
    if (typeof cr.capability === "string" && cr.capability.trim()) {
      decision.capabilityRequest = { capability: cr.capability.trim(), args: cr.args ?? {} };
    }
  }
  if (Array.isArray(r.statePatches)) {
    decision.statePatches = r.statePatches.map(parsePatch);
  }
  return decision;
}
