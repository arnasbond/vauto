/**
 * VAUTO AI Core v2.4 — capability contract (universal capability boundary).
 *
 * A capability is a BOUNDED marketplace operation. It never decides user
 * intent — the reasoning layer decides whether to request a capability.
 * The capability layer owns: input schema, validation, authorization,
 * confirmation requirements, provenance/grounding behavior, execution, and a
 * normalized grounded result envelope.
 *
 * Operation class (declared per capability):
 *   READ          — safe, no mutation; execution-safe args only.
 *   PREPARE       — stages a draft/proposal/preview; no final consequential mutation.
 *   MUTATE        — authenticated, policy-authorized state change.
 *   CONSEQUENTIAL — irreversible / user-visible; requires explicit HITL confirmation.
 *
 * The model may REQUEST a capability. It must NEVER bypass this boundary to
 * invoke domain/database/payment operations directly.
 */

export type CapabilityOperation = "READ" | "PREPARE" | "MUTATE" | "CONSEQUENTIAL";

/** Normalized failure classification — part of the grounded result envelope. */
export type CapabilityFailureKind =
  | "not_found"
  | "authorization"
  | "confirmation_required"
  | "unavailable"
  | "recoverable";

/** Provenance of tool-derived facts — never USER_STATED intent. */
export type ToolFactSource = "TOOL_DERIVED" | "MODEL_INFERRED" | "VISION_DERIVED" | "DOCUMENT_DERIVED";

export interface CapabilityContext {
  /** Authenticated user id, when present. */
  authUserId?: string | null;
  /** Explicit Human-in-the-Loop confirmation for CONSEQUENTIAL operations. */
  confirmed?: boolean;
  /** Image attachment URLs (base64 or http) available for vision analysis. */
  pendingImageUrls?: string[];
}

export interface CapabilityResult<TData = unknown> {
  ok: boolean;
  data?: TData;
  error?: string;
  failureKind?: CapabilityFailureKind;
  /** Provenance of returned facts. Tool facts are TOOL_DERIVED, never USER_STATED. */
  provenance?: ToolFactSource;
}

export interface CapabilityContract<TArgs, TData> {
  /** Stable capability id surfaced to the reasoning layer. */
  readonly name: string;
  readonly description: string;
  /** Operation class (READ | PREPARE | MUTATE | CONSEQUENTIAL). */
  readonly operation: CapabilityOperation;
  /** Permission keys required to execute (empty/undefined = public READ). */
  readonly requiredPermissions?: readonly string[];
  /** True when this operation requires an explicit Human-in-the-Loop confirmation. */
  readonly requiresConfirmation?: boolean;
  /** Validate + coerce untrusted args into a typed, safe TArgs. Throws on invalid. */
  validate(args: unknown): TArgs;
  execute(args: TArgs, ctx: CapabilityContext): Promise<CapabilityResult<TData>>;
}

/** Minimal description surfaced to the reasoning layer (no implementation). */
export interface CapabilityDescription {
  name: string;
  description: string;
  operation: CapabilityOperation;
  requiresConfirmation?: boolean;
}
