/**
 * VAUTO AI Core v2 — bounded multi-step reasoning loop.
 *
 * The model is the semantic authority; tools are bounded READ capabilities.
 * The loop is bounded (no autonomous agent): it lets the model reason, request
 * at most a couple of READ capabilities, receive grounded results, and produce
 * a final response. A capability result is NEVER the final answer — the model
 * interprets it.
 */
import type { CapabilityRegistry } from "../capability/registry.js";
import type { CapabilityContext, CapabilityResult } from "../capability/capability.js";
import {
  searchListingsCapability,
  type SearchListingsArgs,
} from "../capability/capabilities/search-listings.js";
import { validateReasoningDecision, MalformedReasoningDecisionError } from "../reasoning/reasoning-loop.js";
import type {
  GroundedCapabilityResult,
  ReasoningDecision,
  ReasoningInput,
  ReasoningProvider,
} from "../reasoning/reasoning-contract.js";
import { applyStatePatches } from "../state/state-transitions.js";
import { groundStatePatches } from "./grounding.js";
import type { AuthorityVerifier } from "./authority-verifier.js";
import { deterministicAuthorityVerifier } from "./authority-verifier.js";
import {
  executionEligibleHardConstraints,
  executionEligibleSearchSubject,
  type MarketplaceState,
} from "../state/marketplace-state.js";
import type { StatePatch } from "../state/state-patch.js";
import { CORE_V2_TURN_BUDGET_MS } from "../provider/model-config.js";
import { tryResolveListingCategoryId } from "../../shared/category-registry.js";

export const DEFAULT_MAX_ITERATIONS = 3;
export const DEFAULT_MAX_CAPABILITY_CALLS = 3;
export const DEFAULT_MAX_REASONING_CALLS = 6;

/**
 * Raised when the TOTAL per-turn wall-clock budget is exhausted. A per-attempt
 * provider timeout is NOT sufficient: this aborts further provider attempts,
 * verifier calls, and loop iterations, and classifies the turn truthfully
 * (never a fabricated semantic response).
 */
export class TurnBudgetExceededError extends Error {
  readonly code = "turn_budget_exceeded";
  constructor(message: string) {
    super(message);
    this.name = "TurnBudgetExceededError";
  }
}

/**
 * Raised when the reasoning model persistently requests an already executed
 * identical capability after receiving a grounded duplicate notice.
 */
export class PersistentDuplicateCapabilityError extends Error {
  readonly code = "persistent_duplicate_capability";
  readonly capability: string;
  readonly execKey: string;
  constructor(capability: string, execKey: string) {
    super(`Persistent duplicate capability request for ${capability} (${execKey})`);
    this.name = "PersistentDuplicateCapabilityError";
    this.capability = capability;
    this.execKey = execKey;
  }
}

export interface MultiStepLoopOptions {
  provider: ReasoningProvider;
  registry: CapabilityRegistry;
  input: ReasoningInput;
  /** Maximum executed capability calls per turn (default: 3). */
  maxCapabilityCalls?: number;
  /** Maximum total reasoning calls per turn (circuit breaker, default: 6). */
  maxReasoningCalls?: number;
  /** Legacy alias for backward compatibility / tests (maps to maxCapabilityCalls if set). */
  maxIterations?: number;
  /** Total per-turn wall-clock budget (ms). Defaults to CORE_V2_TURN_BUDGET_MS. */
  turnBudgetMs?: number;
  onEvent?: (e: LoopEvent) => void;
  /** Narrow authority verifier for USER_STATED grounding (default: continuity-only). */
  authorityVerifier?: AuthorityVerifier;
  /** Capability execution context (authenticated user + HITL confirmation flag). */
  capabilityContext?: CapabilityContext;
  diagnosticContext?: { threadId?: string; turnId?: string };
}

export type LoopEvent =
  | { type: "reasoning"; iteration: number }
  | { type: "capability"; name: string; ok: boolean; error?: string }
  | { type: "bound_reached"; iterations: number };

export interface CapabilityCallRecord {
  name: string;
  ok: boolean;
  error?: string;
  /** Raw grounded capability result data (for cross-turn result continuity). */
  data?: unknown;
}

export interface MultiStepLoopResult {
  /** The final reasoning decision (may be empty if the bound was reached). */
  decision: ReasoningDecision;
  finalState: MarketplaceState;
  iterations: number;
  capabilityCalls: CapabilityCallRecord[];
  /** USER_STATED claims the grounding layer rejected (demoted to MODEL_INFERENCE). */
  rejectedAuthority: Array<{ patch: StatePatch; reason: string }>;
  /** Every proposed patch across all loop iterations (pre-grounding). */
  allProposedPatches: StatePatch[];
}

/**
 * Derive execution-safe search arguments.
 * Model capabilityRequest.args are validated and canonicalized via searchListingsCapability.validate().
 * Explicit capability arguments take precedence; omitted fields inherit from authoritative state.
 */
export function deriveSearchListingsArgs(
  state: MarketplaceState,
  modelArgs: unknown
): SearchListingsArgs {
  const eligible = executionEligibleHardConstraints(state);
  const eligibleSubject = executionEligibleSearchSubject(state);

  let validated: Partial<SearchListingsArgs> = {};
  if (modelArgs && typeof modelArgs === "object" && !Array.isArray(modelArgs)) {
    try {
      validated = searchListingsCapability.validate(modelArgs);
    } catch {
      validated = {};
    }
  }

  let maxPrice: number | undefined;
  if (eligible.priceMax !== undefined && validated.maxPrice !== undefined) {
    maxPrice = Math.min(eligible.priceMax, validated.maxPrice);
  } else {
    maxPrice = validated.maxPrice ?? eligible.priceMax;
  }

  let minPrice: number | undefined;
  if (eligible.priceMin !== undefined && validated.minPrice !== undefined) {
    minPrice = Math.max(eligible.priceMin, validated.minPrice);
  } else {
    minPrice = validated.minPrice ?? eligible.priceMin;
  }

  const rawCategory = eligible.category ?? validated.category;
  const category = rawCategory ? (tryResolveListingCategoryId(rawCategory) ?? undefined) : undefined;
  const city = eligible.location ?? validated.city;
  const query = eligibleSubject ?? validated.query;

  return {
    query,
    category,
    city,
    minPrice,
    maxPrice,
    limit: validated.limit,
  };
}

function summarizeResult(capability: string, result: CapabilityResult<unknown>): GroundedCapabilityResult {
  if (!result.ok) {
    return {
      capability,
      ok: false,
      error: result.error ?? "capability failed",
      failureKind: result.failureKind,
    };
  }
  const d = result.data as { count?: number; listings?: Array<{ title: string }>; title?: string; price?: number } | undefined;
  if (capability === "searchListings" && d) {
    const titles = (d.listings ?? []).slice(0, 5).map((l) => l.title).join("; ");
    return {
      capability,
      ok: true,
      summary: `rasta ${d.count ?? 0} skelbimų${titles ? `: ${titles}` : ""}`,
      provenance: result.provenance ?? "TOOL_DERIVED",
    };
  }
  if (capability === "listingDetails" && d) {
    return {
      capability,
      ok: true,
      summary: `${d.title ?? ""} (${d.price ?? "?"} €)`,
      provenance: result.provenance ?? "TOOL_DERIVED",
    };
  }
  if (capability === "webResearch" && d) {
    const res = d as {
      count?: number;
      sources?: Array<{
        title?: string;
        source?: string;
        snippet?: string;
        url?: string;
        provenanceTag?: "WEB_RESEARCH";
      }>;
    };
    const sources = (res.sources ?? []).slice(0, 3).map((s) => ({
      title: s.title ?? "Untitled",
      url: s.url ?? "",
      source: s.source ?? "web",
      snippet: s.snippet ?? "",
      provenanceTag: "WEB_RESEARCH" as const,
    }));
    const items = sources
      .map((s) => `[WEB_RESEARCH] [${s.source}] ${s.title}${s.url ? ` (${s.url})` : ""}: ${s.snippet}`)
      .join(" | ");
    return {
      capability,
      ok: true,
      summary: `rasta ${res.count ?? sources.length} šaltiniai (WEB_RESEARCH)${items ? `: ${items}` : ""}`,
      provenance: result.provenance ?? "TOOL_DERIVED",
      sources,
    };
  }
  if (capability === "analyzePhoto" && d) {
    const photoData = d as {
      detectedObjects?: string[];
      category?: string;
      titleCandidate?: string;
      descriptionCandidate?: string;
      price?: number;
      attributes?: Record<string, string>;
      isDocument?: boolean;
      ocrText?: string;
    };
    const parts: string[] = [];
    if (photoData.detectedObjects?.length) {
      parts.push(`objektai: ${photoData.detectedObjects.join(", ")}`);
    }
    if (photoData.category) {
      parts.push(`kategorija: ${photoData.category}`);
    }
    if (photoData.titleCandidate) {
      parts.push(`pavadinimas: ${photoData.titleCandidate}`);
    }
    if (photoData.descriptionCandidate) {
      parts.push(`aprašymas: ${photoData.descriptionCandidate.slice(0, 100)}`);
    }
    if (photoData.price !== undefined && Number.isFinite(photoData.price)) {
      parts.push(`kaina: ${photoData.price} €`);
    }
    if (photoData.attributes && typeof photoData.attributes === "object") {
      const entries = Object.entries(photoData.attributes).filter(([_, v]) => Boolean(v && String(v).trim()));
      if (entries.length > 0) {
        const attrsStr = entries.map(([k, v]) => `${k}: ${v}`).join(", ");
        parts.push(`savybės: ${attrsStr}`);
      }
    }
    if (photoData.ocrText) {
      parts.push(`tekstas: ${photoData.ocrText.slice(0, 150)}`);
    }
    const tag = photoData.isDocument ? "DOCUMENT_DERIVED" : "VISION_DERIVED";
    const summaryText = parts.length > 0 ? parts.join("; ") : "nuotraukos analizė atlikta";
    return {
      capability,
      ok: true,
      summary: `[${tag}] ${summaryText}`,
      provenance: result.provenance ?? tag,
    };
  }
  return {
    capability,
    ok: true,
    summary: "ok",
    provenance: result.provenance ?? "TOOL_DERIVED",
  };
}

/**
 * Bound an awaited sub-step by the REMAINING turn budget. If the budget is
 * already exhausted, or the sub-step outlives it, raise TurnBudgetExceededError
 * (truthful budget exhaustion, never a fabricated success).
 */
export function withinBudget<T>(p: Promise<T>, remainingMs: number): Promise<T> {
  if (remainingMs <= 0) {
    return Promise.reject(new TurnBudgetExceededError("turn budget exhausted"));
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new TurnBudgetExceededError("turn budget exhausted"));
      }
    }, remainingMs);
    p.then(
      (v) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(v);
        }
      },
      (e) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(e);
        }
      }
    );
  });
}

export async function runMultiStepLoop(opts: MultiStepLoopOptions): Promise<MultiStepLoopResult> {
  const maxCaps = opts.maxCapabilityCalls ?? opts.maxIterations ?? DEFAULT_MAX_CAPABILITY_CALLS;
  const maxReasoning = opts.maxReasoningCalls ?? (opts.maxIterations != null ? opts.maxIterations : maxCaps * 2);
  const turnBudgetMs = opts.turnBudgetMs ?? CORE_V2_TURN_BUDGET_MS;
  const deadline = Date.now() + turnBudgetMs;
  let state = opts.input.state;
  const groundedResults: GroundedCapabilityResult[] = [];
  const capabilityCalls: CapabilityCallRecord[] = [];
  const rejectedAuthority: MultiStepLoopResult["rejectedAuthority"] = [];
  const allProposedPatches: StatePatch[] = [];
  const executedCallKeys = new Set<string>();
  const duplicateCallCounts = new Map<string, number>();
  let decision: ReasoningDecision = {};
  let reasoningCalls = 0;
  let executedCapCount = 0;

  while (reasoningCalls < maxReasoning) {
    if (deadline - Date.now() <= 0) {
      throw new TurnBudgetExceededError("turn budget exhausted");
    }
    reasoningCalls++;
    opts.onEvent?.({ type: "reasoning", iteration: reasoningCalls });
    const reasoningStartedAt = Date.now();
    try {
      decision =
        (await withinBudget(opts.provider({ ...opts.input, state, groundedResults }), deadline - Date.now())) ?? {};
      console.warn("[core-v2-latency] reasoning_iteration", {
        ...opts.diagnosticContext,
        iteration: reasoningCalls,
        elapsedMs: Date.now() - reasoningStartedAt,
        outcome: "success",
      });
    } catch (error) {
      console.warn("[core-v2-latency] reasoning_iteration", {
        ...opts.diagnosticContext,
        iteration: reasoningCalls,
        elapsedMs: Date.now() - reasoningStartedAt,
        outcome: error instanceof TurnBudgetExceededError ? "turn_budget_exceeded" : "error",
      });
      throw error;
    }
    try {
      validateReasoningDecision(decision);
    } catch (e) {
      if (e instanceof MalformedReasoningDecisionError) throw e;
      throw e;
    }

    if (decision.statePatches?.length) {
      allProposedPatches.push(...decision.statePatches);
      // Ground before applying: the model cannot self-grant USER_STATED authority.
      const grounded = await withinBudget(
        groundStatePatches(
          state,
          decision.statePatches,
          opts.input.userTurn,
          opts.authorityVerifier ?? deterministicAuthorityVerifier
        ),
        deadline - Date.now()
      );
      state = applyStatePatches(state, grounded.accepted);
      rejectedAuthority.push(...grounded.rejectedAuthority);
    }

    if (!decision.capabilityRequest) {
      return {
        decision,
        finalState: state,
        iterations: reasoningCalls,
        capabilityCalls,
        rejectedAuthority,
        allProposedPatches,
      };
    }

    const req = decision.capabilityRequest;
    const contract = opts.registry.get(req.capability);
    if (!contract) {
      capabilityCalls.push({ name: req.capability, ok: false, error: "unknown_capability" });
      opts.onEvent?.({ type: "capability", name: req.capability, ok: false, error: "unknown_capability" });
      groundedResults.push({
        capability: req.capability,
        ok: false,
        error: "unknown_capability",
        failureKind: "unavailable",
      });
      continue;
    }

    const ctx: CapabilityContext = opts.capabilityContext ?? {};

    // Deterministic authority gate. READ + PREPARE execute in the loop; MUTATE
    // requires an authenticated actor; CONSEQUENTIAL is never auto-executed —
    // it surfaces the Human-in-the-Loop confirmation boundary instead.
    if (contract.operation === "CONSEQUENTIAL") {
      capabilityCalls.push({ name: req.capability, ok: false, error: "confirmation_required" });
      opts.onEvent?.({ type: "capability", name: req.capability, ok: false, error: "confirmation_required" });
      groundedResults.push({
        capability: req.capability,
        ok: false,
        error: "confirmation_required",
        failureKind: "confirmation_required",
      });
      return {
        decision,
        finalState: state,
        iterations: reasoningCalls,
        capabilityCalls,
        rejectedAuthority,
        allProposedPatches,
      };
    }
    if (contract.operation === "MUTATE" && !ctx.authUserId) {
      capabilityCalls.push({ name: req.capability, ok: false, error: "authorization" });
      opts.onEvent?.({ type: "capability", name: req.capability, ok: false, error: "authorization" });
      groundedResults.push({
        capability: req.capability,
        ok: false,
        error: "authorization",
        failureKind: "authorization",
      });
      return {
        decision,
        finalState: state,
        iterations: reasoningCalls,
        capabilityCalls,
        rejectedAuthority,
        allProposedPatches,
      };
    }

    // Execution-safe args: search filters derive from USER_INTENT state only.
    const execArgs =
      req.capability === "searchListings"
        ? deriveSearchListingsArgs(state, req.args)
        : contract.validate(req.args);

    const execKey = `${req.capability}:${JSON.stringify(execArgs)}`;
    if (executedCallKeys.has(execKey)) {
      const currentDupCount = duplicateCallCounts.get(execKey) ?? 0;
      console.warn("[core-v2-loop] duplicate capability request detected — reusing prior grounded result", {
        capability: req.capability,
        execKey,
        dupAttempt: currentDupCount + 1,
      });
      if (currentDupCount === 0) {
        duplicateCallCounts.set(execKey, 1);
        groundedResults.push({
          capability: req.capability,
          ok: true,
          summary: `[PASTABA] Įrankis ${req.capability} JAU įvykdytas šiame turne ir jo rezultatai pateikti aukščiau. Nesikreipk iš naujo tokiu pačiu įrankiu — naudok turimus rezultatus ir atsakyk vartotojui.`,
          provenance: "TOOL_DERIVED",
        });
        continue;
      }
      console.warn("[core-v2-loop] persistent duplicate capability request circuit broken", {
        capability: req.capability,
        execKey,
      });
      throw new PersistentDuplicateCapabilityError(req.capability, execKey);
    }

    if (executedCapCount >= maxCaps) {
      console.warn("[core-v2-loop] capability execution budget reached", {
        executedCapCount,
        maxCaps,
      });
      continue;
    }

    executedCallKeys.add(execKey);
    executedCapCount++;

    let result: CapabilityResult<unknown>;
    const capabilityStartedAt = Date.now();
    try {
      result = await withinBudget(
        contract.execute(execArgs as never, ctx),
        deadline - Date.now()
      );
    } catch (err) {
      if (err instanceof TurnBudgetExceededError) throw err;
      result = { ok: false, error: err instanceof Error ? err.message : "capability error" };
    }
    console.warn("[core-v2-latency] capability", {
      ...opts.diagnosticContext,
      name: req.capability,
      elapsedMs: Date.now() - capabilityStartedAt,
      outcome: result.ok ? "success" : "failure",
      failureKind: result.failureKind ?? null,
      error: result.error ? String(result.error).slice(0, 150) : null,
    });
    capabilityCalls.push({ name: req.capability, ok: result.ok, error: result.error, data: result.data });
    opts.onEvent?.({
      type: "capability",
      name: req.capability,
      ok: result.ok,
      error: result.error,
    });
    groundedResults.push(summarizeResult(req.capability, result));
  }

  opts.onEvent?.({ type: "bound_reached", iterations: reasoningCalls });
  return {
    decision,
    finalState: state,
    iterations: reasoningCalls,
    capabilityCalls,
    rejectedAuthority,
    allProposedPatches,
  };
}
