/**
 * VAUTO AI Core v2.3A — Gemini structured-output schema + parser for
 * ReasoningDecision. The model output is UNTRUSTED: parsing is lenient ONLY
 * where the field is free-form, and STRICT on the canonical state contract.
 *
 *  - `setHard`/`removeHard` keys are runtime-validated against the canonical
 *    executable set (category | location | priceMin | priceMax). Any other
 *    key ("" / "city" / "bodyType" / "propertyType" / ...) is a
 *    schema/state-contract rejection — never silently stored.
 *  - `setHard` value must be a scalar (string | number). An array or object is
 *    rejected, not coerced.
 *  - Negative/exclusion intent uses `addExclusion` (non-executable), never
 *    `setHard`.
 */
import type { ReasoningDecision } from "../reasoning/reasoning-contract.js";
import type { StatePatch } from "../state/state-patch.js";
import {
  CANONICAL_HARD_CONSTRAINT_KEYS,
  type CanonicalHardConstraintKey,
  type Provenance,
  type ProvenanceSource,
} from "../state/marketplace-state.js";

const PATCH_OPS = [
  "setHard",
  "removeHard",
  "setSearchSubject",
  "removeSearchSubject",
  "addSoft",
  "removeSoft",
  "addExclusion",
  "removeExclusion",
  "setGoal",
  "setVertical",
  "addUnresolved",
  "resolveUnresolved",
] as const;

/** Typed contract rejection so the shadow harness can classify cleanly. */
export class StatePatchContractError extends Error {
  readonly code = "state_patch_contract";
  constructor(message: string) {
    super(message);
    this.name = "StatePatchContractError";
  }
}

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
          op: { type: "string" as const, enum: [...PATCH_OPS] },
          key: {
            type: "string" as const,
            enum: [...CANONICAL_HARD_CONSTRAINT_KEYS],
          },
          value: {
            anyOf: [{ type: "string" as const }, { type: "number" as const }],
          },
          label: { type: "string" as const },
          subject: { type: "string" as const },
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

const CANONICAL_KEY_SET: ReadonlySet<string> = new Set(
  CANONICAL_HARD_CONSTRAINT_KEYS
);

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

function requireCanonicalKey(raw: unknown): CanonicalHardConstraintKey {
  const key = String(raw ?? "");
  if (!CANONICAL_KEY_SET.has(key)) {
    throw new StatePatchContractError(`noncanonical hard-constraint key: ${JSON.stringify(key)}`);
  }
  return key as CanonicalHardConstraintKey;
}

function requireScalarValue(raw: unknown): string | number {
  if (typeof raw === "string" || (typeof raw === "number" && Number.isFinite(raw))) {
    return raw;
  }
  throw new StatePatchContractError(`setHard value must be a scalar (string|number), got ${Array.isArray(raw) ? "array" : typeof raw}`);
}

/** Empty/blank free-form content is a no-op (skip), never a hard rejection. */
function optionalString(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t || null;
}

function evidenceOf(raw: unknown): { evidence?: string } {
  return typeof raw === "string" && raw.trim() ? { evidence: raw.trim() } : {};
}

/**
 * Parse one patch. Returns `null` for a structurally-valid but empty free-form
 * patch (e.g. an empty soft/exclusion label) — such a patch is skipped, not
 * stored and not a rejection. Throws `StatePatchContractError` only on a
 * contract violation (noncanonical setHard/removeHard key, non-scalar value,
 * unknown op).
 */
function parsePatch(raw: unknown): StatePatch | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const op = String(r.op ?? "");
  switch (op) {
    case "setHard":
      return {
        op,
        key: requireCanonicalKey(r.key),
        value: requireScalarValue(r.value),
        provenance: parseProvenance(r.provenance),
        ...evidenceOf(r.evidence),
      };
    case "removeHard":
      return { op, key: requireCanonicalKey(r.key) };
    case "setSearchSubject": {
      const subject = optionalString(r.subject);
      if (!subject) return null;
      return {
        op,
        subject,
        provenance: parseProvenance(r.provenance),
        ...evidenceOf(r.evidence),
      };
    }
    case "removeSearchSubject":
      return { op };
    case "addSoft": {
      const label = optionalString(r.label);
      if (!label) return null;
      return { op, label, provenance: parseProvenance(r.provenance) };
    }
    case "removeSoft": {
      const label = optionalString(r.label);
      if (!label) return null;
      return { op, label };
    }
    case "addExclusion": {
      const label = optionalString(r.label);
      if (!label) return null;
      return {
        op,
        label,
        provenance: parseProvenance(r.provenance),
        ...evidenceOf(r.evidence),
      };
    }
    case "removeExclusion": {
      const label = optionalString(r.label);
      if (!label) return null;
      return { op, label };
    }
    case "setGoal": {
      const goal = optionalString(r.goal);
      if (!goal) return null;
      return { op, goal };
    }
    case "setVertical": {
      const vertical = optionalString(r.vertical);
      if (!vertical) return null;
      return { op, vertical };
    }
    case "addUnresolved": {
      const question = optionalString(r.question);
      if (!question) return null;
      return { op, question };
    }
    case "resolveUnresolved": {
      const question = optionalString(r.question);
      if (!question) return null;
      return { op, question };
    }
    default:
      throw new StatePatchContractError(`unknown patch op: ${JSON.stringify(op)}`);
  }
}

/** Parse Gemini JSON output into a ReasoningDecision (validation happens later). */
export function parseReasoningDecision(raw: unknown): ReasoningDecision {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new StatePatchContractError("reasoning output must be an object");
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
    const parsed: StatePatch[] = [];
    for (const p of r.statePatches) {
      const patch = parsePatch(p);
      if (patch) parsed.push(patch);
    }
    if (parsed.length) decision.statePatches = parsed;
  }
  return decision;
}
