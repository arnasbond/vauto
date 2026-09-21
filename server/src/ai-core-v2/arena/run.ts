/**
 * VAUTO AI Core v2.3R.1 — Arena runner: one provider-neutral case → one record.
 *
 * The provider proposes a decision; the shared authority/state infrastructure
 * (verifier + grounding + execution-safe args) is what actually mutates state.
 * A provider can never bypass this. All request costs (reasoning, retries,
 * verifiers) are recorded per task.
 */
import type { CapabilityRegistry } from "../capability/registry.js";
import type { ReasoningDecision, ReasoningInput } from "../reasoning/reasoning-contract.js";
import type { MarketplaceState } from "../state/marketplace-state.js";
import { isExecutionEligible } from "../state/marketplace-state.js";
import { applyStatePatches } from "../state/state-transitions.js";
import { groundStatePatches } from "../loop/grounding.js";
import { deriveSearchListingsArgs } from "../loop/multi-step-loop.js";
import type { AuthorityVerifier } from "../loop/authority-verifier.js";
import type { ArenaFixture } from "./fixtures.js";
import { NO_USAGE, type ArenaProvider, type ArenaRecord, type ProviderResult, type RequestCost, type TaskCost } from "./types.js";

function classifyStructural(err: { code?: string } | undefined): ArenaRecord["structural"] {
  if (!err) return "valid";
  const c = err.code ?? "";
  if (c === "timeout") return "timeout";
  if (c === "http_error" || c === "provider_unavailable") return "http";
  if (c === "malformed_json") return "malformed";
  if (c === "schema_invalid" || c === "contract_error") return "schema_invalid";
  return "malformed";
}

function classifyOutcome(structural: ArenaRecord["structural"], allChecksPass: boolean): ArenaRecord["outcome"] {
  if (structural === "timeout" || structural === "http") return "NOT_EVALUATED";
  if (structural === "schema_invalid" || structural === "malformed") return "CONTRACT_FAIL";
  return allChecksPass ? "PASS" : "SEMANTIC_FAIL";
}

/** Execution args must derive ONLY from USER_STATED (execution-eligible) state. */
function authorityOk(state: MarketplaceState, args: ReturnType<typeof deriveSearchListingsArgs>): boolean {
  const ok = (v: unknown, p: unknown) => (v === undefined ? true : isExecutionEligible(p as never));
  return (
    ok(args.maxPrice, state.hardConstraintProvenance.priceMax) &&
    ok(args.minPrice, state.hardConstraintProvenance.priceMin) &&
    ok(args.city, state.hardConstraintProvenance.location) &&
    ok(args.category, state.hardConstraintProvenance.category) &&
    ok(args.query, state.searchSubjectProvenance)
  );
}

/** Defensive clone: the provider receives a COPY so it can never mutate state. */
function cloneState(s: MarketplaceState): MarketplaceState {
  return {
    ...s,
    hardConstraints: { ...s.hardConstraints },
    hardConstraintProvenance: { ...s.hardConstraintProvenance },
    softPreferences: [...s.softPreferences],
    exclusions: [...s.exclusions],
    unresolved: [...s.unresolved],
    selectedListingIds: [...s.selectedListingIds],
  };
}

function buildTaskCost(pr: ProviderResult, verifierRequests: RequestCost[]): TaskCost {
  const requests: RequestCost[] = [];
  const billed: RequestCost["billed"] = pr.error
    ? pr.error.code === "provider_unavailable"
      ? "not_billed"
      : "unknown"
    : "billed";
  requests.push({ role: "reasoning", usage: pr.usage, billed });
  for (let i = 1; i < pr.attempts; i++) {
    requests.push({ role: "retry", usage: NO_USAGE, billed: "unknown" });
  }
  requests.push(...verifierRequests);
  return { requests };
}

export async function runArenaCase(opts: {
  provider: ArenaProvider;
  fixture: ArenaFixture;
  verifier: AuthorityVerifier;
  registry: CapabilityRegistry;
}): Promise<ArenaRecord> {
  const input: ReasoningInput = {
    userTurn: opts.fixture.userTurn,
    history: [],
    state: opts.fixture.priorState,
    capabilities: opts.registry.describe().map((c) => ({ name: c.name, description: c.description, operation: c.operation as "READ" })),
  };

  let pr: ProviderResult;
  try {
    pr = await opts.provider({ ...input, state: cloneState(input.state) });
  } catch (err) {
    const structural = classifyStructural(err as { code?: string });
    return {
      provider: "unknown",
      model: "unknown",
      scenario: opts.fixture.id,
      structural,
      outcome: classifyOutcome(structural, false),
      authorityOk: true,
      capabilityAuthorized: false,
      executionSafeArgs: {},
      latencyMs: 0,
      attempts: 1,
      verifierCalls: 0,
      cost: { requests: [{ role: "reasoning", usage: NO_USAGE, billed: "unknown" }] },
      finalState: opts.fixture.priorState,
    };
  }

  const decision: ReasoningDecision = pr.decision ?? {};
  const structural = classifyStructural(pr.error);
  if (structural !== "valid") {
    return {
      provider: pr.info.provider,
      model: pr.info.model,
      scenario: opts.fixture.id,
      structural,
      outcome: classifyOutcome(structural, false),
      authorityOk: true,
      capabilityRequested: decision.capabilityRequest?.capability,
      capabilityAuthorized: false,
      executionSafeArgs: {},
      latencyMs: pr.latencyMs,
      attempts: pr.attempts,
      verifierCalls: 0,
      cost: buildTaskCost(pr, []),
      finalState: opts.fixture.priorState,
    };
  }

  // Grounding → authoritative state (verifier is the sole authority assigner).
  // Each verifier call is recorded as a request (billing status unknown here).
  const verifierRequests: RequestCost[] = [];
  const wrappedVerifier: AuthorityVerifier = async (claim, ctx) => {
    const verdict = await opts.verifier(claim, ctx);
    verifierRequests.push({ role: "verifier", usage: NO_USAGE, billed: "unknown" });
    return verdict;
  };
  const grounded = await groundStatePatches(input.state, decision.statePatches ?? [], opts.fixture.userTurn, wrappedVerifier);
  const finalState = applyStatePatches(input.state, grounded.accepted);
  const execArgs = deriveSearchListingsArgs(finalState, {});

  const capName = decision.capabilityRequest?.capability;
  const contract = capName ? opts.registry.get(capName) : undefined;
  const capabilityAuthorized = capName != null && contract?.operation === "READ";

  const checks = opts.fixture.checks.map((c) => ({ label: c.label, pass: c.pass(finalState, execArgs, decision), detail: c.detail(finalState, execArgs, decision) }));
  const outcome = classifyOutcome("valid", checks.every((c) => c.pass));

  return {
    provider: pr.info.provider,
    model: pr.info.model,
    scenario: opts.fixture.id,
    structural: "valid",
    outcome,
    authorityOk: authorityOk(finalState, execArgs),
    capabilityRequested: capName,
    capabilityAuthorized,
    executionSafeArgs: execArgs as unknown as Record<string, unknown>,
    latencyMs: pr.latencyMs,
    attempts: pr.attempts,
    verifierCalls: verifierRequests.length,
    cost: buildTaskCost(pr, verifierRequests),
    finalState,
  };
}
