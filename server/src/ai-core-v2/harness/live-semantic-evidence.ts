/**
 * VAUTO AI Core v2.3A — LIVE SEMANTIC EVIDENCE runner (shadow-only).
 *
 * Runs the V2.3A semantic harness (`runSemanticScenario`) against the REAL
 * Gemini provider + REAL Gemini authority verifier for natural-language
 * scenario families A–L. Read-only: bounded READ capability stubs (no DB, no
 * mutation). This file is a measurement harness, not a production path.
 *
 *   npx tsx src/ai-core-v2/harness/live-semantic-evidence.ts
 */
import { createGeminiReasoningProvider } from "../provider/gemini-provider.js";
import {
  CORE_V2_MODEL,
  CORE_V2_REASONING_TIMEOUT_MS,
  CORE_V2_MAX_REASONING_ATTEMPTS,
} from "../provider/model-config.js";
import { createGeminiAuthorityVerifier } from "../loop/authority-verifier.js";
import { CapabilityRegistry } from "../capability/registry.js";
import type { CapabilityContract } from "../capability/capability.js";
import { runSemanticScenario, type ScenarioRecord } from "./semantic-harness.js";
import { deriveSearchListingsArgs } from "../loop/multi-step-loop.js";
import {
  emptyMarketplaceState,
  provenance,
  executionEligibleSearchSubject,
  type MarketplaceState,
} from "../state/marketplace-state.js";
import { setHardConstraint } from "../state/state-transitions.js";
import type { ReasoningHistoryEntry } from "../reasoning/reasoning-contract.js";

// ---------------------------------------------------------------------------
// Bounded READ capability stubs — the capability layer is NOT the semantic
// authority under test (the reasoning provider + authority verifier are).
// These are READ-only and return deterministic empty results so the model can
// never cite an invented listing fact.
// ---------------------------------------------------------------------------
function readCapability(name: string, description: string): CapabilityContract<unknown, unknown> {
  return {
    name,
    description,
    consequence: "READ",
    validate: () => ({}),
    execute: async () =>
      name === "searchListings"
        ? { ok: true, data: { count: 0, listings: [] } }
        : { ok: false, error: "not_found" },
  };
}

const registry = new CapabilityRegistry();
registry.register(readCapability("searchListings", "Ieškoti aktyvių skelbimų (READ)."));
registry.register(readCapability("listingDetails", "Skaityti skelbimo detales (READ)."));

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------
function num(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function hardSource(s: MarketplaceState, key: string): string | undefined {
  return (s.hardConstraintProvenance as Record<string, { source?: string } | undefined>)[key]?.source;
}

interface Check {
  label: string;
  pass: boolean;
  detail: string;
}

function safeArgs(record: ScenarioRecord): Record<string, unknown> {
  const a = deriveSearchListingsArgs(record.finalState, {});
  return { query: a.query, category: a.category, city: a.city, minPrice: a.minPrice, maxPrice: a.maxPrice };
}

/** Any USER_STATED hard constraint whose value positively asserts a concept. */
function hardValues(s: MarketplaceState): Array<{ key: string; value: unknown; source: string | undefined }> {
  return Object.entries(s.hardConstraints as Record<string, unknown>).map(([k, v]) => ({
    key: k,
    value: v,
    source: hardSource(s, k),
  }));
}

function hasPositiveHard(s: MarketplaceState, re: RegExp): boolean {
  return hardValues(s).some((h) => h.source === "USER_STATED" && re.test(String(h.value)));
}

function hasExclusion(s: MarketplaceState, re: RegExp): boolean {
  return s.exclusions.some((e) => re.test(e.label));
}

type FailureKind = "none" | "infra" | "contract" | "semantic";

function classifyFailure(code: string | undefined): FailureKind {
  if (!code) return "none";
  if (["timeout", "http_error", "provider_unavailable"].includes(code)) return "infra";
  if (["schema_invalid", "malformed_json", "state_patch_contract", "malformed_result", "state_transition_error"].includes(code)) {
    return "contract";
  }
  return "semantic";
}

// ---------------------------------------------------------------------------
// Scenario families A–L
// ---------------------------------------------------------------------------
interface LiveScenario {
  id: string;
  title: string;
  userTurn: string;
  history: ReasoningHistoryEntry[];
  priorState: MarketplaceState;
  checks: (r: ScenarioRecord) => Check[];
}

function base(): MarketplaceState {
  return emptyMarketplaceState();
}

const scenarios: LiveScenario[] = [
  {
    id: "A",
    title: "Budget normalization — „iki 20 tūkst.“ → priceMax=20000",
    userTurn: "Ieškau automobilio iki 20 tūkst.",
    history: [],
    priorState: base(),
    checks: (r) => [
      {
        label: "priceMax normalized to 20000",
        pass: num(r.finalState.hardConstraints.priceMax) === 20000,
        detail: `priceMax=${String(r.finalState.hardConstraints.priceMax)}`,
      },
      {
        label: "priceMax provenance USER_STATED",
        pass: hardSource(r.finalState, "priceMax") === "USER_STATED",
        detail: `source=${hardSource(r.finalState, "priceMax")}`,
      },
      {
        label: "execution-safe maxPrice = 20000",
        pass: num(safeArgs(r).maxPrice) === 20000,
        detail: JSON.stringify(safeArgs(r)),
      },
    ],
  },
  {
    id: "B",
    title: "Location declension — „Kaune“ → location=Kaunas",
    userTurn: "Noriu buto Kaune.",
    history: [],
    priorState: base(),
    checks: (r) => [
      {
        label: "location normalized to Kaunas",
        pass: r.finalState.hardConstraints.location === "Kaunas",
        detail: `location=${String(r.finalState.hardConstraints.location)}`,
      },
      {
        label: "location provenance USER_STATED",
        pass: hardSource(r.finalState, "location") === "USER_STATED",
        detail: `source=${hardSource(r.finalState, "location")}`,
      },
    ],
  },
  {
    id: "C",
    title: "Negation — „SUV nenoriu“ must NOT authorize positive SUV",
    userTurn: "Ieškau automobilio, bet SUV nenoriu.",
    history: [],
    priorState: base(),
    checks: (r) => [
      {
        label: "no USER_STATED positive SUV hard constraint",
        pass: !hasPositiveHard(r.finalState, /suv/i),
        detail: `positiveSUV=${hasPositiveHard(r.finalState, /suv/i)}`,
      },
      {
        label: "exclusion recorded (or no positive claim made)",
        pass: hasExclusion(r.finalState, /suv/i) || r.finalState.exclusions.length === 0,
        detail: `exclusions=[${r.finalState.exclusions.map((e) => e.label).join(",") || "none"}]`,
      },
    ],
  },
  {
    id: "D",
    title: "Invented subject — ungrounded „Toyota“ must NOT gain execution authority",
    userTurn: "Reikia šeimai patikimo automobilio.",
    history: [],
    priorState: base(),
    checks: (r) => [
      {
        label: "no user-stated search subject → query undefined",
        pass: safeArgs(r).query === undefined,
        detail: `query=${String(safeArgs(r).query)}`,
      },
      {
        label: "searchSubject not execution-eligible",
        pass: executionEligibleSearchSubject(r.finalState) === undefined,
        detail: `subject=${String(r.finalState.searchSubject)} prov=${r.finalState.searchSubjectProvenance?.source ?? "none"}`,
      },
    ],
  },
  {
    id: "E",
    title: "Continuity — verified priceMax=20000 persists through „o dabar parodyk“",
    userTurn: "O dabar parodyk, ką turit.",
    history: [
      { role: "user", text: "Ieškau automobilio iki 20 tūkst." },
      { role: "assistant", text: "Radau keletą variantų." },
    ],
    priorState: (() => {
      let s = base();
      s = setHardConstraint(s, "priceMax", 20000, provenance("USER_STATED"));
      return s;
    })(),
    checks: (r) => [
      {
        label: "priceMax still 20000 after follow-up",
        pass: num(r.finalState.hardConstraints.priceMax) === 20000,
        detail: `priceMax=${String(r.finalState.hardConstraints.priceMax)}`,
      },
      {
        label: "priceMax provenance still USER_STATED",
        pass: hardSource(r.finalState, "priceMax") === "USER_STATED",
        detail: `source=${hardSource(r.finalState, "priceMax")}`,
      },
      {
        label: "execution-safe maxPrice = 20000",
        pass: num(safeArgs(r).maxPrice) === 20000,
        detail: JSON.stringify(safeArgs(r)),
      },
    ],
  },
  {
    id: "F",
    title: "Combined — budget + city + soft wish (soft never hard)",
    userTurn: "Ieškau kotedžo Vilniuje iki 120 tūkst., norisi su sodu.",
    history: [],
    priorState: base(),
    checks: (r) => [
      {
        label: "priceMax = 120000 USER_STATED",
        pass: num(r.finalState.hardConstraints.priceMax) === 120000 && hardSource(r.finalState, "priceMax") === "USER_STATED",
        detail: `priceMax=${String(r.finalState.hardConstraints.priceMax)} src=${hardSource(r.finalState, "priceMax")}`,
      },
      {
        label: "location = Vilnius USER_STATED",
        pass: r.finalState.hardConstraints.location === "Vilnius" && hardSource(r.finalState, "location") === "USER_STATED",
        detail: `location=${String(r.finalState.hardConstraints.location)} src=${hardSource(r.finalState, "location")}`,
      },
      {
        label: "soft wish did not become a hard filter",
        pass: !Object.keys(r.finalState.hardConstraints).some((k) => /sod/i.test(k)),
        detail: `hardKeys=[${Object.keys(r.finalState.hardConstraints).join(",")}] soft=[${r.finalState.softPreferences.map((p) => p.label).join(",")}]`,
      },
    ],
  },
  {
    id: "G",
    title: "Ambiguous open goal — clarify, do not invent hard filters",
    userTurn: "Noriu pirkti automobilį.",
    history: [],
    priorState: base(),
    checks: (r) => [
      {
        label: "no invented execution-eligible hard filters",
        pass: safeArgs(r).maxPrice === undefined && safeArgs(r).city === undefined && safeArgs(r).category === undefined,
        detail: JSON.stringify(safeArgs(r)),
      },
    ],
  },
  {
    id: "H",
    title: "Advisory turn — no forced search, no invented constraints",
    userTurn: "Ką patartum šeimai su dviem vaikais?",
    history: [],
    priorState: base(),
    checks: (r) => [
      {
        label: "no forced search / no invented hard filters",
        pass: safeArgs(r).maxPrice === undefined && safeArgs(r).city === undefined,
        detail: JSON.stringify(safeArgs(r)),
      },
      {
        label: "a visible response was produced",
        pass: Boolean(r.finalResponse),
        detail: `response="${String(r.finalResponse ?? "").slice(0, 80)}"`,
      },
    ],
  },
  {
    id: "I",
    title: "User-stated search subject — „Toyota Corolla“ is execution-eligible",
    userTurn: "Ieškau Toyota Corolla.",
    history: [],
    priorState: base(),
    checks: (r) => [
      {
        label: "search subject execution-eligible",
        pass: executionEligibleSearchSubject(r.finalState) != null,
        detail: `subject=${String(r.finalState.searchSubject)} prov=${r.finalState.searchSubjectProvenance?.source ?? "none"}`,
      },
    ],
  },
  {
    id: "J",
    title: "Soft-only preferences never become hard filters or query",
    userTurn: "Ieškau mašinos, patikimos ir ekonomiškos.",
    history: [],
    priorState: base(),
    checks: (r) => [
      {
        label: "no hard constraints",
        pass: Object.keys(r.finalState.hardConstraints).length === 0,
        detail: `hardKeys=[${Object.keys(r.finalState.hardConstraints).join(",")}]`,
      },
      {
        label: "no user-stated query",
        pass: safeArgs(r).query === undefined,
        detail: `query=${String(safeArgs(r).query)}`,
      },
    ],
  },
  {
    id: "K",
    title: "Budget with currency words — „iki 15 000 eurų“ → priceMax=15000",
    userTurn: "Biudžetas iki 15 000 eurų, ieškau džipo.",
    history: [],
    priorState: base(),
    checks: (r) => [
      {
        label: "priceMax = 15000 USER_STATED",
        pass: num(r.finalState.hardConstraints.priceMax) === 15000 && hardSource(r.finalState, "priceMax") === "USER_STATED",
        detail: `priceMax=${String(r.finalState.hardConstraints.priceMax)} src=${hardSource(r.finalState, "priceMax")}`,
      },
    ],
  },
  {
    id: "L",
    title: "Negation — „tik ne dyzelinio“ must NOT authorize diesel",
    userTurn: "Ieškau automobilio, tik ne dyzelinio.",
    history: [],
    priorState: base(),
    checks: (r) => [
      {
        label: "no USER_STATED positive diesel hard constraint",
        pass: !hasPositiveHard(r.finalState, /d(i|y)?zel/i),
        detail: `positiveDiesel=${hasPositiveHard(r.finalState, /d(i|y)?zel/i)} hard=${JSON.stringify(r.finalState.hardConstraints)}`,
      },
      {
        label: "diesel represented as exclusion (or not at all), never a hard filter",
        pass: !Object.values(r.finalState.hardConstraints).some((v) => /d(i|y)?zel/i.test(String(v))),
        detail: `exclusions=[${r.finalState.exclusions.map((e) => e.label).join(",") || "none"}]`,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const provider = createGeminiReasoningProvider();
  const verifierModel = process.env.VAUTO_CORE_V2_MODEL?.trim() || CORE_V2_MODEL;
  const verifier = createGeminiAuthorityVerifier({ model: verifierModel });

  console.log("=== VAUTO AI Core v2.3A LIVE SEMANTIC EVIDENCE ===");
  console.log(`Reasoning model: ${CORE_V2_MODEL}`);
  console.log(`Authority-verifier model: ${verifierModel}`);
  console.log(`Reasoning timeout: ${CORE_V2_REASONING_TIMEOUT_MS}ms · max attempts: ${CORE_V2_MAX_REASONING_ATTEMPTS}`);
  console.log(`Scenario families: A–L (${scenarios.length})`);
  console.log("");

  const filter = (process.env.LIVE_SCENARIOS ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const runSet = filter.length ? scenarios.filter((s) => filter.includes(s.id)) : scenarios;
  if (filter.length) {
    console.log(`Filtered to scenarios: ${runSet.map((s) => s.id).join(",")}`);
    console.log("");
  }

  const results: Array<{
    id: string;
    title: string;
    userTurn: string;
    finalResponse?: string;
    finalIterationProposedPatches: unknown;
    allProposedPatches: unknown;
    rejectedAuthority: unknown;
    capabilityRequested?: string;
    executionSafeArgs?: Record<string, unknown>;
    capabilityResult?: unknown;
    iterations: number;
    finalState: MarketplaceState;
    failure?: unknown;
    failureKind: FailureKind;
    checks: Check[];
    outcome: "PASS" | "SEMANTIC_FAIL" | "CONTRACT_FAIL" | "NOT_EVALUATED";
  }> = [];

  for (const s of runSet) {
    const record = await runSemanticScenario({
      turnId: s.id,
      userTurn: s.userTurn,
      history: s.history,
      priorState: s.priorState,
      provider,
      registry,
      authorityVerifier: verifier,
      capabilities: registry.describe().map((c) => ({
        name: c.name,
        description: c.description,
        consequence: c.consequence as "READ",
      })),
    });

    const checks = s.checks(record);
    const allChecksPass = checks.every((c) => c.pass);
    const execArgs = safeArgs(record);
    const failureKind = classifyFailure(record.failure?.code as string | undefined);
    const outcome: "PASS" | "SEMANTIC_FAIL" | "CONTRACT_FAIL" | "NOT_EVALUATED" = record.failure
      ? failureKind === "infra"
        ? "NOT_EVALUATED"
        : "CONTRACT_FAIL"
      : allChecksPass
        ? "PASS"
        : "SEMANTIC_FAIL";

    results.push({
      id: s.id,
      title: s.title,
      userTurn: s.userTurn,
      finalResponse: record.finalResponse,
      finalIterationProposedPatches: record.finalIterationProposedPatches.map((p) => ({ op: (p as { op?: string }).op, key: (p as { key?: string }).key, value: (p as { value?: unknown }).value, prov: (p as { provenance?: { source?: string } }).provenance?.source })),
      allProposedPatches: record.allProposedPatches.map((p) => ({ op: (p as { op?: string }).op, key: (p as { key?: string }).key, value: (p as { value?: unknown }).value, prov: (p as { provenance?: { source?: string } }).provenance?.source })),
      rejectedAuthority: record.rejectedAuthority,
      capabilityRequested: record.capabilityRequested,
      executionSafeArgs: execArgs,
      capabilityResult: record.capabilityResult,
      iterations: record.iterations,
      finalState: record.finalState,
      failure: record.failure,
      failureKind,
      checks,
      outcome,
    });

    console.log(`[${outcome}] ${s.id} ${s.title}`);
    console.log(`      turn: "${s.userTurn}"`);
    if (record.failure) {
      console.log(`      FAILURE(${failureKind}): ${record.failure.code}: ${record.failure.reason}`);
    } else {
      console.log(`      response: "${String(record.finalResponse ?? "").slice(0, 120)}"`);
      console.log(`      allProposedPatches: ${JSON.stringify(results[results.length - 1]!.allProposedPatches)}`);
      console.log(`      rejectedAuthority: [${record.rejectedAuthority.map((x) => x.reason).join("; ") || "none"}]`);
      console.log(`      capability: ${record.capabilityRequested ?? "(none)"}  result=${record.capabilityResult ? JSON.stringify(record.capabilityResult) : "(none)"}`);
      console.log(`      executionSafeArgs: ${JSON.stringify(execArgs)}`);
      console.log(`      exclusions: [${record.finalState.exclusions.map((e) => `${e.label}:${e.provenance.source}`).join(",") || "none"}]`);
    }
    for (const c of checks) {
      console.log(`      ${c.pass ? "✓" : "✗"} ${c.label} — ${c.detail}`);
    }
    console.log("");
  }

  const counts = {
    PASS: results.filter((r) => r.outcome === "PASS").length,
    SEMANTIC_FAIL: results.filter((r) => r.outcome === "SEMANTIC_FAIL").length,
    CONTRACT_FAIL: results.filter((r) => r.outcome === "CONTRACT_FAIL").length,
    NOT_EVALUATED: results.filter((r) => r.outcome === "NOT_EVALUATED").length,
  };

  console.log("=== SUMMARY ===");
  console.log(JSON.stringify(counts));
  console.log("");

  const fs = await import("node:fs");
  const path = await import("node:path");
  const os = await import("node:os");
  const outDir = path.join(os.tmpdir(), "vauto-core-v23-live-semantic");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(outDir, `live-semantic-23a-${stamp}.json`);
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        reasoningModel: CORE_V2_MODEL,
        verifierModel,
        counts,
        results: results.map((r) => ({
          id: r.id,
          title: r.title,
          userTurn: r.userTurn,
          outcome: r.outcome,
          failure: r.failure,
          finalResponse: r.finalResponse,
          allProposedPatches: r.allProposedPatches,
          rejectedAuthority: r.rejectedAuthority,
          capabilityRequested: r.capabilityRequested,
          executionSafeArgs: r.executionSafeArgs,
          iterations: r.iterations,
          finalHardConstraints: r.finalState.hardConstraints,
          finalHardProvenance: Object.fromEntries(
            Object.entries(r.finalState.hardConstraintProvenance).map(([k, v]) => [k, (v as { source?: string })?.source])
          ),
          searchSubject: r.finalState.searchSubject,
          searchSubjectProvenance: r.finalState.searchSubjectProvenance?.source,
          softPreferences: r.finalState.softPreferences.map((p) => p.label),
          exclusions: r.finalState.exclusions.map((e) => ({ label: e.label, source: e.provenance.source })),
          checks: r.checks,
        })),
      },
      null,
      2
    ),
    "utf8"
  );
  console.log(`Trace written: ${jsonPath}`);
}

main().catch((e) => {
  console.error("RUNNER ERROR:", e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
