/**
 * E0 — golden conversation simulator.
 *
 * Runs a full multi-turn conversation against the REAL `runVautoAgent`
 * pipeline. The simulator emulates ONLY the client-side behaviors that feed
 * the server (history window, draft wire resolution, auth context) — and that
 * emulation is itself part of what is being measured (RC-2/RC-3). No agent
 * logic is bypassed or duplicated: every turn goes through the real request
 * build + agent entry point.
 */
import { runVautoAgent } from "../../ai/vauto-agent.js";
import {
  createScriptedModelProvider,
  type ScriptedModelRecorder,
} from "./scripted-model-provider.js";
import { planTurn } from "../../ai/planner/planner-engine.js";
import { setPlannerDecisionProviderForTests } from "../../ai/planner/planner-orchestrator.js";
import type {
  FailureCategory,
  GoldenScenario,
  ScenarioResult,
  TurnFailure,
  TurnResult,
} from "./golden-types.js";

/** Client history window — mirrors VautoAgentContext `slice(-6)` (RC-3). */
const CLIENT_HISTORY_WINDOW = 6;

interface SimState {
  history: Array<{ role: "user" | "assistant"; text: string }>;
  draft: Record<string, unknown> | null;
  published: boolean;
  confirmations: string[];
  effects: string[];
}

function isGenericDraftTitle(t?: unknown): boolean {
  const s = String(t ?? "").trim().toLowerCase();
  if (!s) return true;
  if (s === "naujas skelbimas" || s === "drabužių skelbimas" || s === "prekė") return true;
  if (/^.+?\s+[—–-]\s+naujas skelbimas$/.test(s)) return true;
  return false;
}

/** Mirror of the client wire-draft rule (src/lib/agent-wire-context.ts). */
function wireDraft(draft: Record<string, unknown> | null): Record<string, unknown> | undefined {
  if (!draft) return undefined;
  if (isGenericDraftTitle(draft.title)) return undefined;
  return draft;
}

function pushHistory(state: SimState, msg: { role: "user" | "assistant"; text: string }) {
  state.history.push(msg);
  if (state.history.length > CLIENT_HISTORY_WINDOW) {
    state.history = state.history.slice(-CLIENT_HISTORY_WINDOW);
  }
}

/** DEEP snapshot of every authoritative, mutation-sensitive state the
 *  harness emulates. Used for authorityDenied before/after comparison. */
function deepStateSnapshot(state: SimState): string {
  return JSON.stringify({
    draft: state.draft,
    published: state.published,
    confirmations: [...state.confirmations].sort(),
    effects: [...state.effects].sort(),
  });
}

export async function runGoldenScenario(
  scenario: GoldenScenario
): Promise<ScenarioResult> {
  // E2.1 — the deterministic harness emulates the LLM-first planner with the
  // deterministic REFERENCE planner (same philosophy as the scripted model
  // provider standing in for Gemini). The real LLM-first path is exercised
  // by planner-llm unit tests and the LIVE model gate.
  setPlannerDecisionProviderForTests(async (input) => planTurn(input));
  const state: SimState = {
    history: [],
    draft: (scenario.setup?.initialDraft as Record<string, unknown> | undefined) ?? null,
    published: false,
    confirmations: [],
    effects: [],
  };

  const turns: TurnResult[] = [];
  const allFailures: TurnFailure[] = [];

  for (let i = 0; i < scenario.turns.length; i++) {
    const turn = scenario.turns[i]!;
    const failures: TurnFailure[] = [];
    let modelCalled = false;
    let modelRounds = 0;
    let replyHead = "";
    let actionsType = "none";
    let toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let draftAfter: Record<string, unknown> | null = state.draft;
    let searchQuery = "";
    let searchFilters: Record<string, unknown> = {};
    let threw: unknown = null;

    pushHistory(state, { role: "user", text: turn.userText });

    // DEEP snapshot of authoritative state BEFORE the turn (authority gates
    // compare before/after, never object references).
    const beforeSnapshot = deepStateSnapshot(state);

    const recorder: ScriptedModelRecorder = createScriptedModelProvider({
      turns: [turn.model],
      exhausted: { parts: [] },
    });
    const prevFetch = recorder.install();
    process.env.GEMINI_API_KEY = "e0-golden-scripted-key";
    try {
      const response = await runVautoAgent({
        messages: state.history.map((m) => ({ role: m.role, text: m.text })),
        authUserId: scenario.setup?.authUserId ?? undefined,
        context: {
          isAuthenticated: scenario.setup?.isAuthenticated ?? true,
          userCity: scenario.setup?.userCity ?? "Vilnius",
          contact: scenario.setup?.contact ?? "+37060000000",
          profilePhone: scenario.setup?.profilePhone ?? "+37060000000",
          listingDraft: wireDraft(state.draft),
          ...(scenario.setup?.myListings
            ? {
                myListings: scenario.setup.myListings.map((l) => ({
                  id: l.id,
                  title: l.title,
                  price: 1000,
                  category: "vehicles",
                  location: "Vilnius",
                  status: l.status ?? "active",
                })),
                listings: [],
              }
            : {}),
          ...(turn.pendingImageUrls?.length
            ? { pendingImageUrls: turn.pendingImageUrls }
            : {}),
          ...(scenario.setup?.freshListingSession ? { freshListingSession: true } : {}),
        },
      });
      modelCalled = recorder.calls.length > 0;
      modelRounds = recorder.calls.length;
      replyHead = String(response.reply ?? "").slice(0, 160);
      actionsType = String(response.actions.type ?? "none");
      toolCalls = (response.toolCalls ?? []).map((t) => ({
        name: String(t.name),
        args: (t.result && typeof t.result === "object"
          ? (t.result as Record<string, unknown>)
          : {}) as Record<string, unknown>,
      }));

      // Apply actions to the simulated client state (client-like mirror).
      const actions = response.actions as {
        type: string;
        listingDraft?: Record<string, unknown>;
        searchQuery?: unknown;
        filters?: Record<string, unknown>;
        [k: string]: unknown;
      };
      searchQuery = String(actions.searchQuery ?? "");
      searchFilters = (actions.filters ?? {}) as Record<string, unknown>;
      if (actions.type === "listing_draft" && actions.listingDraft) {
        state.draft = actions.listingDraft as Record<string, unknown>;
        draftAfter = state.draft;
      }
      for (const tc of response.toolCalls ?? []) {
        const name = String(tc.name);
        if (name === "postNewListing") {
          state.published = true;
          state.effects.push("listing_published");
        }
        if (name === "blockListing" || name === "markListingSold") {
          const pendingId = String(
            ((tc.result as Record<string, unknown>)?.pendingActionId ?? "")
          );
          if (pendingId) {
            state.confirmations.push(`${name}:${pendingId}`);
          }
        }
      }
      // Consequential proposals may travel on the ACTION payload instead of
      // the tool result (block_listing / mark_listing_sold side effects).
      const actType = String((actions as { type?: string }).type ?? "");
      if (actType === "block_listing" || actType === "mark_listing_sold") {
        const pendingId = String(
          (actions as { pendingActionId?: unknown }).pendingActionId ?? ""
        );
        if (pendingId) {
          state.confirmations.push(`${actType}:${pendingId}`);
        }
      }

      pushHistory(state, { role: "assistant", text: String(response.reply ?? "") });
    } catch (e) {
      threw = e;
      failures.push({
        category: "infrastructure_test_failure",
        message: `turn ${i + 1} threw: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      recorder.restore();
      delete process.env.GEMINI_API_KEY;
      if (prevFetch) globalThis.fetch = prevFetch;
    }

    // ── Contract evaluation ────────────────────────────────────────────────
    const expect = turn.expect;
    if (expect) {
      if (expect.modelMustBeConsulted && !modelCalled) {
        failures.push({
          category: "planner_bypass",
          message: `turn ${i + 1}: deterministic branch answered without consulting the model`,
        });
      }
      if (expect.expectedTools?.length) {
        const recorded = new Set(toolCalls.map((t) => t.name));
        const missing = expect.expectedTools.filter((t) => !recorded.has(t));
        if (missing.length) {
          failures.push({
            category: modelCalled ? "wrong_tool" : "planner_bypass",
            message: `turn ${i + 1}: expected tools ${missing.join(", ")}; got [${[...recorded].join(", ") || "none"}]`,
          });
        }
      }
      if (expect.expectedToolCalls?.length) {
        for (const call of expect.expectedToolCalls) {
          const executed = toolCalls.filter((t) => t.name === call.name);
          if (!executed.length) {
            failures.push({
              category: modelCalled ? "wrong_tool" : "planner_bypass",
              message: `turn ${i + 1}: expected tool call ${call.name} never executed`,
            });
            continue;
          }
          for (const [key, value] of Object.entries(call.argsSubset)) {
            const flat = executed[0]!.args[key];
            const nested = (executed[0]!.args.draft as Record<string, unknown> | undefined)?.[key];
            const actual = flat !== undefined ? flat : nested;
            if (String(actual ?? "") !== String(value)) {
              failures.push({
                category: "wrong_tool",
                message: `turn ${i + 1}: ${call.name} args.${key} expected ${String(value)}, got ${String(actual ?? "")}`,
              });
            }
          }
        }
      }
      if (expect.forbiddenTools?.length) {
        const recorded = new Set(toolCalls.map((t) => t.name));
        for (const t of expect.forbiddenTools) {
          if (recorded.has(t)) {
            failures.push({
              category: "wrong_tool",
              message: `turn ${i + 1}: user goal was turned into forbidden tool ${t}`,
            });
          }
        }
      }
      if (expect.expectedFacets) {
        for (const [key, value] of Object.entries(expect.expectedFacets)) {
          const actual = searchFilters[key];
          if (String(actual ?? "") !== String(value)) {
            failures.push({
              category: "wrong_state_source",
              message: `turn ${i + 1}: facet ${key} expected ${String(value)}, got ${String(actual ?? "")}`,
            });
          }
        }
      }
      if (expect.expectedQueryContains?.length) {
        const q = searchQuery.toLowerCase();
        for (const frag of expect.expectedQueryContains) {
          if (!q.includes(frag.toLowerCase())) {
            failures.push({
              category: "wrong_state_source",
              message: `turn ${i + 1}: search query „${searchQuery}“ must contain „${frag}“`,
            });
          }
        }
      }
      if (expect.category && draftAfter) {
        if (draftAfter.category !== expect.category) {
          failures.push({
            category: "wrong_state_source",
            message: `turn ${i + 1}: expected category ${expect.category}, got ${String(draftAfter.category)}`,
          });
        }
      }
      if (expect.facts && draftAfter) {
        const attrs = (draftAfter.attributes ?? {}) as Record<string, unknown>;
        for (const [key, value] of Object.entries(expect.facts)) {
          const actual =
            key === "price"
              ? draftAfter.price
              : key === "title"
                ? draftAfter.title
                : key === "location"
                  ? draftAfter.location
                  : attrs[key];
          if (value !== undefined && String(actual) !== String(value)) {
            failures.push({
              category: "stale_state",
              message: `turn ${i + 1}: fact ${key} expected ${String(value)}, got ${String(actual)}`,
            });
          }
        }
      }
      if (expect.forbiddenFacts?.length && draftAfter) {
        const attrs = (draftAfter.attributes ?? {}) as Record<string, unknown>;
        for (const key of expect.forbiddenFacts) {
          if (attrs[key] !== undefined) {
            failures.push({
              category: "policy_conflict",
              message: `turn ${i + 1}: forbidden fact ${key} present`,
            });
          }
        }
      }
      if (expect.expectedConfirmations?.length) {
        for (const c of expect.expectedConfirmations) {
          if (!state.confirmations.some((x) => x.startsWith(c))) {
            failures.push({
              category: "policy_conflict",
              message: `turn ${i + 1}: missing confirmation ${c}`,
            });
          }
        }
      }
      if (expect.forbiddenConfirmations?.length) {
        for (const c of expect.forbiddenConfirmations) {
          if (state.confirmations.some((x) => x.startsWith(c))) {
            failures.push({
              category: "policy_conflict",
              message: `turn ${i + 1}: forbidden confirmation ${c} occurred`,
            });
          }
        }
      }
      if (expect.expectedEffects?.length) {
        for (const e of expect.expectedEffects) {
          if (!state.effects.includes(e)) {
            failures.push({
              category: "policy_conflict",
              message: `turn ${i + 1}: expected effect ${e} missing`,
            });
          }
        }
      }
      if (expect.forbiddenEffects?.length) {
        for (const e of expect.forbiddenEffects) {
          if (state.effects.includes(e)) {
            failures.push({
              category: "policy_conflict",
              message: `turn ${i + 1}: forbidden effect ${e} occurred`,
            });
          }
        }
      }
      if (expect.continuity && draftAfter) {
        const attrs = (draftAfter.attributes ?? {}) as Record<string, unknown>;
        const actual = attrs[expect.continuity.factKey];
        if (String(actual) !== String(expect.continuity.expectedValue)) {
          failures.push({
            category: "context_truncation",
            message: `turn ${i + 1}: continuity fact ${expect.continuity.factKey} lost (expected ${expect.continuity.expectedValue}, got ${String(actual)})`,
          });
        }
      }
      if (expect.positiveOutcome?.length) {
        const lower = replyHead.toLowerCase();
        for (const frag of expect.positiveOutcome) {
          if (!lower.includes(frag.toLowerCase())) {
            failures.push({
              category: "goal_missed",
              message: `turn ${i + 1}: positive outcome „${frag}“ missing — the user's goal was not served (reply: „${replyHead.slice(0, 90)}“)`,
            });
          }
        }
      }
      if (expect.replyMustMention?.length) {
        for (const frag of expect.replyMustMention) {
          if (!replyHead.toLowerCase().includes(frag.toLowerCase())) {
            failures.push({
              category: modelCalled ? "model_reasoning_failure" : "planner_bypass",
              message: `turn ${i + 1}: reply must mention „${frag}“; got „${replyHead.slice(0, 90)}“`,
            });
          }
        }
      }
      if (expect.replyMustNotMention?.length) {
        for (const frag of expect.replyMustNotMention) {
          if (replyHead.toLowerCase().includes(frag.toLowerCase())) {
            failures.push({
              category: "tool_override",
              message: `turn ${i + 1}: reply must NOT mention „${frag}“; got „${replyHead.slice(0, 90)}“`,
            });
          }
        }
      }
      if (expect.authorityDenied) {
        // DEEP before/after comparison — any authoritative mutation (draft,
        // publish state, confirmations, effects) without an explicitly allowed
        // effect is an authority violation.
        const afterSnapshot = deepStateSnapshot(state);
        const allowedEffects = expect.expectedEffects ?? [];
        if (beforeSnapshot !== afterSnapshot && allowedEffects.length === 0) {
          failures.push({
            category: "policy_conflict",
            message: `turn ${i + 1}: authority-denied turn mutated authoritative state (before: ${beforeSnapshot}, after: ${afterSnapshot})`,
          });
        }
      }
    }

    const authorityCorrect = !failures.some(
      (f) => f.category === "policy_conflict"
    );
    const behaviorCorrect = !failures.some((f) =>
      [
        "model_reasoning_failure",
        "wrong_tool",
        "planner_bypass",
        "tool_override",
        "goal_missed",
      ].includes(f.category)
    );
    const stateCorrect = !failures.some((f) =>
      f.category === "stale_state" || f.category === "wrong_state_source"
    );
    const toolCorrect = !failures.some((f) => f.category === "wrong_tool");
    const continuityCorrect = !failures.some((f) =>
      f.category === "context_truncation" || f.category === "missing_assistant_history"
    );
    const endToEndCorrect = failures.length === 0;

    allFailures.push(...failures);
    turns.push({
      index: i + 1,
      userText: turn.userText.slice(0, 90),
      status: endToEndCorrect ? "PASS" : "FAIL",
      authorityCorrect,
      behaviorCorrect,
      stateCorrect,
      toolCorrect,
      continuityCorrect,
      endToEndCorrect,
      modelCalled,
      modelRounds,
      toolCalls,
      replyHead,
      actionsType,
      draft: draftAfter,
      failures,
    });
    void threw;
  }

  // ── Scenario-level final checks ─────────────────────────────────────────
  const finalFailures: TurnFailure[] = [];
  if (scenario.final) {
    if (scenario.final.expectedEffects?.length) {
      for (const e of scenario.final.expectedEffects) {
        if (!state.effects.includes(e)) {
          finalFailures.push({
            category: "policy_conflict",
            message: `final: expected effect ${e} missing`,
          });
        }
      }
    }
    if (scenario.final.forbiddenEffects?.length) {
      for (const e of scenario.final.forbiddenEffects) {
        if (state.effects.includes(e)) {
          finalFailures.push({
            category: "policy_conflict",
            message: `final: forbidden effect ${e} occurred`,
          });
        }
      }
    }
    if (scenario.final.expectedFacts && state.draft) {
      const attrs = (state.draft.attributes ?? {}) as Record<string, unknown>;
      for (const [key, value] of Object.entries(scenario.final.expectedFacts)) {
        const actual = key === "price" ? state.draft.price : key === "title" ? state.draft.title : attrs[key];
        if (value !== undefined && String(actual) !== String(value)) {
          finalFailures.push({
            category: "stale_state",
            message: `final: fact ${key} expected ${String(value)}, got ${String(actual)}`,
          });
        }
      }
    }
  }
  allFailures.push(...finalFailures);

  const endToEndCorrect = allFailures.length === 0;
  return {
    id: scenario.id,
    title: scenario.title,
    group: scenario.group,
    status: endToEndCorrect ? "PASS" : "FAIL",
    authorityCorrect: !allFailures.some((f) => f.category === "policy_conflict"),
    behaviorCorrect: !allFailures.some((f) =>
      ["model_reasoning_failure", "wrong_tool", "planner_bypass", "tool_override", "goal_missed"].includes(f.category)
    ),
    stateCorrect: !allFailures.some((f) => f.category === "stale_state" || f.category === "wrong_state_source"),
    toolCorrect: !allFailures.some((f) => f.category === "wrong_tool"),
    continuityCorrect: !allFailures.some((f) => f.category === "context_truncation" || f.category === "missing_assistant_history"),
    endToEndCorrect,
    turns,
    failures: allFailures,
  };
}

export function classifyTurnFailure(category: FailureCategory): FailureCategory {
  return category;
}
