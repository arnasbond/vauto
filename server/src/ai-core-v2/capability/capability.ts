/**
 * VAUTO AI Core v2 — capability contract.
 *
 * A capability is a BOUNDED marketplace operation. It never decides user
 * intent — the reasoning layer decides whether to request a capability.
 * The capability layer owns: input schema, validation, permission
 * requirements, consequential classification, execution, and normalized
 * result.
 *
 * Consequence classes:
 *   READ                 — safe, no mutation.
 *   PREPARE              — stages a draft/proposal, no persistence of record.
 *   EXECUTE              — authorized, non-destructive state change.
 *   CONFIRMATION_REQUIRED— consequential/irreversible: needs HITL confirmation.
 */

export type CapabilityConsequence = "READ" | "PREPARE" | "EXECUTE" | "CONFIRMATION_REQUIRED";

export interface CapabilityContext {
  /** Authenticated user id, when present. */
  authUserId?: string | null;
}

export interface CapabilityResult<TData = unknown> {
  ok: boolean;
  data?: TData;
  error?: string;
}

export interface CapabilityContract<TArgs, TData> {
  readonly name: string;
  readonly description: string;
  readonly consequence: CapabilityConsequence;
  /** Permission keys required to execute (empty/undefined = public READ). */
  readonly requiredPermissions?: readonly string[];
  /** Validate + coerce untrusted args into a typed, safe TArgs. Throws on invalid. */
  validate(args: unknown): TArgs;
  execute(args: TArgs, ctx: CapabilityContext): Promise<CapabilityResult<TData>>;
}

/** Minimal description surfaced to the reasoning layer (no implementation). */
export interface CapabilityDescription {
  name: string;
  description: string;
  consequence: CapabilityConsequence;
}
