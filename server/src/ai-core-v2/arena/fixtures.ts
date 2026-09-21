/**
 * VAUTO AI Core v2.3R — provider-neutral Arena fixtures (benchmark-only).
 *
 * These are structural/semantic acceptance predicates, NOT production phrase
 * lists. They describe what VAUTO meaning should materialize for a diagnostic
 * turn. They never leak into the production prompt.
 */
import type { ReasoningDecision } from "../reasoning/reasoning-contract.js";
import {
  emptyMarketplaceState,
  provenance,
  executionEligibleSearchSubject,
  type MarketplaceState,
} from "../state/marketplace-state.js";
import { setHardConstraint } from "../state/state-transitions.js";
import { deriveSearchListingsArgs } from "../loop/multi-step-loop.js";

type ExecArgs = ReturnType<typeof deriveSearchListingsArgs>;

export interface ArenaCheck {
  label: string;
  pass: (s: MarketplaceState, args: ExecArgs, d: ReasoningDecision) => boolean;
  detail: (s: MarketplaceState, args: ExecArgs, d: ReasoningDecision) => string;
}

export interface ArenaFixture {
  id: string;
  userTurn: string;
  priorState: MarketplaceState;
  checks: ArenaCheck[];
}

function num(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
  return undefined;
}
function src(s: MarketplaceState, key: string): string | undefined {
  return (s.hardConstraintProvenance as Record<string, { source?: string } | undefined>)[key]?.source;
}

export const FIXTURE_F: ArenaFixture = {
  id: "F",
  userTurn: "Ieškau kotedžo Vilniuje iki 120 tūkst., norisi su sodu.",
  priorState: emptyMarketplaceState(),
  checks: [
    { label: "priceMax=120000 USER_STATED", pass: (s) => num(s.hardConstraints.priceMax) === 120000 && src(s, "priceMax") === "USER_STATED", detail: (s) => `priceMax=${s.hardConstraints.priceMax}/${src(s, "priceMax")}` },
    { label: "location=Vilnius USER_STATED", pass: (s) => s.hardConstraints.location === "Vilnius" && src(s, "location") === "USER_STATED", detail: (s) => `loc=${s.hardConstraints.location}/${src(s, "location")}` },
    { label: "soft 'sodu' not hard", pass: (s) => !Object.keys(s.hardConstraints).some((k) => /sod/i.test(k)), detail: (s) => `hardKeys=${Object.keys(s.hardConstraints).join(",")}` },
  ],
};

export const FIXTURE_G: ArenaFixture = {
  id: "G",
  userTurn: "Noriu pirkti automobilį.",
  priorState: emptyMarketplaceState(),
  checks: [
    { label: "no invented execution filter", pass: (_s, args) => args.maxPrice === undefined && args.city === undefined && args.category === undefined, detail: (_s, args) => JSON.stringify(args) },
    { label: "no forced catalog search", pass: (_s, _args, d) => d.capabilityRequest?.capability !== "searchListings", detail: (_s, _args, d) => `cap=${d.capabilityRequest?.capability ?? "-"}` },
  ],
};

export const FIXTURE_I: ArenaFixture = {
  id: "I",
  userTurn: "Ieškau Toyota Corolla.",
  priorState: emptyMarketplaceState(),
  checks: [
    { label: "search subject USER_STATED", pass: (s) => executionEligibleSearchSubject(s) != null, detail: (s) => `subject=${s.searchSubject}/${s.searchSubjectProvenance?.source}` },
    { label: "exec.query equals subject", pass: (s, args) => args.query === executionEligibleSearchSubject(s), detail: (_s, args) => `query=${args.query}` },
  ],
};

export const FIXTURE_K: ArenaFixture = {
  id: "K",
  userTurn: "Biudžetas iki 15 000 eurų, ieškau džipo.",
  priorState: emptyMarketplaceState(),
  checks: [
    { label: "priceMax=15000 USER_STATED", pass: (s) => num(s.hardConstraints.priceMax) === 15000 && src(s, "priceMax") === "USER_STATED", detail: (s) => `priceMax=${s.hardConstraints.priceMax}/${src(s, "priceMax")}` },
  ],
};

export const FIXTURE_X1: ArenaFixture = {
  id: "X1",
  userTurn: "Ieškau automobilio, tik ne dyzelinio.",
  priorState: emptyMarketplaceState(),
  checks: [
    { label: "exclusion materialized", pass: (s) => s.exclusions.some((x) => /d(i|y)?zel/i.test(x.label)), detail: (s) => `excl=${s.exclusions.map((x) => `${x.label}:${x.provenance.source}`).join(",")}` },
    { label: "no positive diesel hard", pass: (s) => !Object.values(s.hardConstraints).some((v) => /d(i|y)?zel/i.test(String(v))), detail: (s) => `hard=${JSON.stringify(s.hardConstraints)}` },
  ],
};

/** Retraction: an unrelated turn must NOT erase prior verified budget. */
export const FIXTURE_Q_PRESERVE: ArenaFixture = {
  id: "Q-preserve",
  userTurn: "Parodyk, ką turit.",
  priorState: setHardConstraint(emptyMarketplaceState(), "priceMax", 20000, provenance("USER_STATED")),
  checks: [
    { label: "verified budget preserved", pass: (s) => num(s.hardConstraints.priceMax) === 20000, detail: (s) => `priceMax=${s.hardConstraints.priceMax}` },
  ],
};

/** Retraction: an explicit retraction may remove prior verified budget only with authority. */
export const FIXTURE_Q_REMOVE: ArenaFixture = {
  id: "Q-remove",
  userTurn: "Tiesą sakant, biudžeto limito nereikia.",
  priorState: setHardConstraint(emptyMarketplaceState(), "priceMax", 20000, provenance("USER_STATED")),
  checks: [
    { label: "verified budget removed (with authority)", pass: (s) => s.hardConstraints.priceMax === undefined, detail: (s) => `priceMax=${s.hardConstraints.priceMax}` },
  ],
};

export const ARENA_FIXTURES: ArenaFixture[] = [
  FIXTURE_F,
  FIXTURE_G,
  FIXTURE_I,
  FIXTURE_K,
  FIXTURE_X1,
  FIXTURE_Q_PRESERVE,
  FIXTURE_Q_REMOVE,
];
