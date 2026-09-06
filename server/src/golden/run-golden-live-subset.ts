/**
 * E2.2 — LIVE MODEL SPOT GATE (mandatory before E2.1/E2.2 FULL PASS).
 *
 *   GEMINI_API_KEY=... LIVE_GOLDEN=1 npx tsx src/golden/run-golden-live-subset.ts
 *
 * Runs through the REAL production Agent Core path:
 *   HTTP/SSE route → ThreadService → runVautoAgent → real Gemini planner +
 *   real Gemini tool loop — with threadId/turnId, canonical thread state,
 *   server-side draft state, and the real provider adapter.
 *
 * Every scenario asserts the typed PlannerDecision (via the decision
 * observer) plus canonical state after the turn, tool calls, confirmation
 * requests and forbidden mutations — not just reply text.
 *
 * Without GEMINI_API_KEY the runner reports NOT RUN and exits 2 — it NEVER
 * fabricates a PASS.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import request from "supertest";

import { InMemoryThreadStore } from "../agent-core/thread-store.js";
import { setThreadStoreForTests } from "../agent-core/thread-store-instance.js";
import { optionalAuth } from "../middleware/auth.js";
import { vautoAgentRouter } from "../routes/vauto-agent.js";
import {
  setPlannerDecisionObserverForTests,
  setPlannerAdapterForTests,
  setPlannerDecisionProviderForTests,
  setPlannerTraceObserverForTests,
} from "../ai/planner/planner-orchestrator.js";
import {
  PlannerProviderUnavailableError,
  type PlannerLlmAdapter,
} from "../ai/planner/planner-provider.js";
import type { PlannerDecision } from "../ai/planner/planner-types.js";
import { parseLiveStreamBody } from "./harness/live-stream-parser.js";
import {
  createInMemoryPendingActionStore,
  setDefaultPendingActionStoreForTests,
} from "../ai/confirmation/consequential-action-policy.js";
import { signAccessToken } from "../auth/tokens.js";
import {
  resolveAuthenticatedContextFromServerState,
  setAgentUserContextResolverForTests,
} from "../ai/user-agent-context.js";

interface LiveCase {
  id: string;
  title: string;
  setup?: {
    isAuthenticated?: boolean;
    authUserId?: string;
    myListings?: Array<{ id: string; title: string; status: string }>;
    initialDraft?: Record<string, unknown>;
  };
  turns: Array<{
    text: string;
    assert: {
      intent?: string;
      tool?: string | null;
      toolArgs?: Record<string, unknown>;
      replyContains?: string[];
      replyMustNotContain?: string[];
      draftFact?: { key: string; value: string };
      confirmationPrefix?: string;
      forbiddenEffects?: string[];
      forbiddenTools?: string[];
    };
  }>;
}

const LIVE_CASES: LiveCase[] = [
  {
    id: "LIVE-01",
    title: "open dialog",
    turns: [{ text: "Ką tu gali?", assert: { intent: "dialog", replyContains: ["parduoti"] } }],
  },
  {
    id: "LIVE-02",
    title: "ambiguous input",
    turns: [{ text: "iPhone", assert: { intent: "clarify_ambiguous", replyContains: ["parduoti"], forbiddenTools: ["searchListings"] } }],
  },
  {
    id: "LIVE-03",
    title: "explicit search → searchListings really executed",
    turns: [
      {
        text: "Surask Volvo V70 Vilniuje",
        assert: { intent: "catalog_search", tool: "searchListings", replyContains: ["volvo"] },
      },
    ],
  },
  {
    id: "LIVE-04",
    title: "structured search (facets)",
    turns: [
      {
        text: "butas Vilniuje iki 120000 eur, 3 kambariai",
        assert: { intent: "catalog_search", tool: "searchListings", replyContains: ["vilnius"] },
      },
    ],
  },
  {
    id: "LIVE-05",
    title: "sell create (full first turn)",
    turns: [
      {
        text: "Parduodu naudotą juodą iPhone 15 Pro 256 GB, Kaune, kaina 850 eurų",
        assert: { intent: "sell_create", replyContains: ["iphone"] },
      },
    ],
  },
  {
    id: "LIVE-06",
    title: "sell correction → canonical draft price after turn",
    setup: {
      initialDraft: {
        title: "iPhone 15 Pro 256 GB",
        category: "electronics",
        price: 850,
        location: "Kaunas",
        attributes: { condition: "Naudota" },
        listingFlowState: "DRAFTING_TEXT",
      },
    },
    turns: [
      {
        text: "Kaina dabar 700",
        assert: {
          intent: "sell_update",
          tool: "updateListingDraft",
          replyContains: ["700"],
          draftFact: { key: "price", value: "700" },
          forbiddenTools: ["searchListings"],
        },
      },
    ],
  },
  {
    id: "LIVE-07",
    title: "context recall (what are we selling)",
    setup: {
      initialDraft: {
        title: "iPhone 15 Pro 256 GB",
        category: "electronics",
        price: 850,
        location: "Kaunas",
        attributes: { condition: "Naudota" },
        listingFlowState: "DRAFTING_TEXT",
      },
    },
    turns: [{ text: "Kokį telefoną pardavinėjame?", assert: { intent: "context_question", replyContains: ["iphone"] } }],
  },
  {
    id: "LIVE-08",
    title: "8-message long-context recall",
    setup: {
      initialDraft: {
        title: "BMW 320d",
        category: "vehicles",
        price: 9500,
        location: "Kaunas",
        attributes: { condition: "Naudota" },
        listingFlowState: "DRAFTING_TEXT",
      },
    },
    turns: [
      { text: "gerai", assert: {} },
      { text: "tęskime", assert: {} },
      { text: "Ką dar patartum?", assert: {} },
      { text: "supratau", assert: {} },
      { text: "O kaip su kaina?", assert: {} },
      { text: "pagalvokim", assert: {} },
      { text: "Ar verta?", assert: {} },
      { text: "Kokios būklės buvo mašina?", assert: { intent: "context_question", replyContains: ["naudota"] } },
    ],
  },
  {
    id: "LIVE-09",
    title: "intent switch sell → search",
    setup: {
      initialDraft: {
        title: "iPhone 15 Pro 256 GB",
        category: "electronics",
        price: 850,
        location: "Kaunas",
        attributes: { condition: "Naudota" },
        listingFlowState: "DRAFTING_TEXT",
      },
    },
    turns: [{ text: "Vis dėlto paieškok man buto", assert: { intent: "catalog_search", tool: "searchListings", replyContains: ["but"] } }],
  },
  {
    id: "LIVE-10",
    title: "cancel publish",
    setup: {
      initialDraft: {
        title: "iPhone 15 Pro 256 GB",
        category: "electronics",
        price: 850,
        location: "Kaunas",
        attributes: { condition: "Naudota" },
        listingFlowState: "DRAFT_READY",
      },
    },
    turns: [
      {
        text: "Ne, dar ne",
        assert: { intent: "sell_cancel", replyContains: ["iphone"], forbiddenEffects: ["listing_published"] },
      },
    ],
  },
  {
    id: "LIVE-11",
    title: "unauthorized publish → forbidden mutation",
    setup: { isAuthenticated: false },
    turns: [
      {
        text: "Publikuok skelbimą",
        assert: {
          intent: "publish_request",
          replyContains: ["prisijung"],
          forbiddenEffects: ["listing_published"],
          forbiddenTools: ["searchListings"],
        },
      },
    ],
  },
  {
    id: "LIVE-12",
    title: "consequential confirmation (pendingActionId)",
    setup: {
      authUserId: "user-live-1",
      myListings: [{ id: "lt-live-001", title: "Mano Volvo V70", status: "active" }],
    },
    turns: [
      {
        text: "Pažymėk skelbimą parduotu",
        assert: {
          intent: "consequential_command",
          tool: "markListingSold",
          confirmationPrefix: "mark_listing_sold:",
          replyContains: ["parduot"],
        },
      },
    ],
  },
  {
    id: "LIVE-13",
    title: "wrong-tool protection (financial command never searches)",
    turns: [
      {
        text: "Pervesk 100 eurų iš wallet",
        assert: { intent: "financial_command", replyContains: ["negalima"], forbiddenTools: ["searchListings"] },
      },
    ],
  },
  {
    id: "LIVE-14",
    title: "AI advice / recommendation",
    turns: [{ text: "Ką rekomenduotum parduodant automobilį?", assert: { intent: "context_question" } }],
  },
  {
    id: "LIVE-15",
    title: "provider failure → honest AI-down fallback (never a search)",
    turns: [
      {
        text: "Kokia tavo nuomonė?",
        assert: { intent: "ai_down_dialog", replyContains: ["negali"], forbiddenTools: ["searchListings"] },
      },
    ],
  },
];

function createLiveApp() {
  const app = express();
  app.use(express.json({ limit: "512kb" }));
  app.use(optionalAuth);
  app.use("/api/vauto-agent", vautoAgentRouter);
  return app;
}

interface TurnOutcome {
  reply: string;
  toolCalls: string[];
  /** E2.3 — ONLY this turn's PlannerDecisions (observer-index scoped). */
  decisions: PlannerDecision[];
  /** E2.4 — explicit SSE infrastructure/runtime error (NEVER reply=""). */
  error: { code: string; message: string } | null;
  /** E2.5 — full per-turn production-path trace (raw→zod→clamps→final). */
  traces: Array<{
    rawArgs: Record<string, unknown> | null;
    schemaValid: boolean;
    clampList: string[];
    finalIntent: string | null;
    provider?: string;
    model?: string;
  }>;
  draftAfter: Record<string, unknown> | null;
  confirmations: string[];
  effects: string[];
}

async function runCase(app: ReturnType<typeof createLiveApp>, c: LiveCase) {
  const outcomes: TurnOutcome[] = [];
  const decisions: PlannerDecision[] = [];
  setPlannerDecisionObserverForTests((d) => decisions.push(d));
  const traces: TurnOutcome["traces"] = [];
  setPlannerTraceObserverForTests((t) =>
    traces.push({
      rawArgs: t.rawArgs,
      schemaValid: t.schemaValid,
      clampList: t.clampList,
      finalIntent: t.final?.intent ?? null,
      provider: t.provider,
      model: t.model,
    })
  );

  // E2.3 — LIVE-15 injects a REAL failing adapter for THIS scenario only;
  // every other scenario uses the real provider adapter. The failing
  // adapter throws PlannerProviderUnavailableError exactly like an outage.
  const failingAdapter: PlannerLlmAdapter = {
    providerId: "live-failing",
    async planStructured(): Promise<never> {
      throw new PlannerProviderUnavailableError("injected provider failure (LIVE-15)");
    },
  };
  if (c.id === "LIVE-15") {
    setPlannerAdapterForTests(failingAdapter);
  } else {
    setPlannerAdapterForTests(null);
  }

  // E2.7 — the authenticated scenarios drive the REAL auth path (signed
  // JWT verified by optionalAuth) and the CANONICAL server-side user+
  // listings state through the route's test seam (the isolated stand-in
  // for the database). Client-supplied listings in the HTTP body remain
  // untrusted by the production boundary — exactly as in production.
  let jwt: string | null = null;
  if (c.setup?.authUserId) {
    jwt = signAccessToken({ sub: c.setup.authUserId, role: "user" });
    const canonicalListings = (c.setup?.myListings ?? []).map((l) => ({
      id: l.id,
      title: l.title,
      price: 0,
      category: "vehicles",
      location: "Vilnius",
      status: l.status ?? "active",
    }));
    setAgentUserContextResolverForTests(async (authUserId, clientFallback) => {
      if (!authUserId) {
        return resolveAuthenticatedContextFromServerState(
          { name: "Svečias", role: "buyer", businessType: "", city: "", phone: "" },
          [],
          clientFallback
        );
      }
      return resolveAuthenticatedContextFromServerState(
        {
          name: "Gyvas Vartotojas",
          role: "seller",
          businessType: "",
          city: "Vilnius",
          phone: "+37060000000",
        },
        canonicalListings,
        clientFallback
      );
    });
  } else {
    setAgentUserContextResolverForTests(null);
  }

  try {
    let threadId: string | null = null;
    let anonToken: string | null = null;
    let draft: Record<string, unknown> | null =
      (c.setup?.initialDraft as Record<string, unknown> | undefined) ?? null;
    const confirmations: string[] = [];
    const effects: string[] = [];

    for (const turn of c.turns) {
      // E2.3 — record the observer index BEFORE the request and take only
      // the decisions that appeared during THIS turn. A multi-turn scenario
      // is never evaluated against an earlier turn's decision.
      const decisionIndexBefore = decisions.length;
      const traceIndexBefore = traces.length;

      const res: request.Response = await request(app)
        .post("/api/vauto-agent/stream")
        .set(
          "authorization",
          jwt ? `Bearer ${jwt}` : ""
        )
        .send({
          threadId: threadId ?? undefined,
          anonSessionToken: anonToken ?? undefined,
          turnId: `live-${c.id}-${outcomes.length + 1}`,
          messages: [{ role: "user", text: turn.text }],
          context: {
            isAuthenticated: c.setup?.isAuthenticated !== false,
            userCity: "Vilnius",
            contact: "+37060000000",
            profilePhone: "+37060000000",
            listingDraft: draft ?? undefined,
            listings: [],
          },
          authUserId: undefined,
        });

      const bodyText: string = String(res.text ?? "");
      // E2.4 — parse the REAL wire contract: the final payload lives under
      // `.result`; an SSE error event is an explicit infrastructure ERROR.
      const stream = parseLiveStreamBody(bodyText, {
        threadId,
        anonSessionToken: anonToken,
      });
      if (stream.threadId) threadId = stream.threadId;
      if (stream.anonSessionToken) anonToken = stream.anonSessionToken;

      const reply = stream.finalResult?.reply ?? "";
      const toolCalls = stream.finalResult?.toolCalls.map((t) => t.name) ?? [];
      const actions = stream.finalResult?.actions ?? {};
      if (actions.type === "listing_draft" && actions.listingDraft) {
        draft = actions.listingDraft as Record<string, unknown>;
      }
      for (const tc of toolCalls) {
        if (tc === "postNewListing") effects.push("listing_published");
      }
      if (typeof actions.pendingActionId === "string" && actions.pendingActionId) {
        const at = String(actions.type ?? "");
        confirmations.push(`${at}:${actions.pendingActionId}`);
      }

      outcomes.push({
        reply,
        toolCalls,
        decisions: decisions.slice(decisionIndexBefore),
        error: stream.errorEvent,
        traces: traces.slice(traceIndexBefore),
        draftAfter: draft,
        confirmations: [...confirmations],
        effects: [...effects],
      });
    }
    return { outcomes, decisions };
  } finally {
    // Restore the real provider adapter + the production user-context
    // resolver after the scenario.
    setPlannerAdapterForTests(null);
    setAgentUserContextResolverForTests(null);
  }
}

interface TurnVerdict {
  kind: "PASS" | "FAIL" | "ERROR";
  details: string[];
}

/** E2.5 — full production-path trace lines for FAIL/ERROR scenarios
 *  (raw provider decision → zod → clamps → final). Evidence only — it never
 *  changes the verdict. */
function pushTraceLines(lines: string[], outcomes: TurnOutcome[]): void {
  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i]!;
    for (const t of o.traces) {
      lines.push(
        `  - T${i + 1} trace: raw=${JSON.stringify(t.rawArgs).slice(0, 220)} schema=${t.schemaValid} clamps=[${t.clampList.join(",")}] finalIntent=${t.finalIntent ?? "null"} provider=${t.provider ?? "-"}/${t.model ?? "-"}`
      );
    }
  }
}

function evaluateCase(c: LiveCase, outcomes: TurnOutcome[]): TurnVerdict {
  const details: string[] = [];
  let kind: TurnVerdict["kind"] = "PASS";
  for (let i = 0; i < c.turns.length; i++) {
    const turn = c.turns[i]!;
    const outcome = outcomes[i]!;
    const a = turn.assert;
    // E2.4 — an SSE error event (and no final payload) is an explicit
    // infrastructure/runtime ERROR, never a behavioral FAIL and never
    // reply="".
    if (outcome.error && !outcome.reply) {
      if (kind !== "ERROR") kind = "ERROR";
      details.push(
        `turn ${i + 1}: [ERROR] SSE ${outcome.error.code}: ${outcome.error.message}`
      );
      continue;
    }
    // E2.3 — evaluate ONLY this turn's own decisions (last new decision).
    const decision = outcome.decisions[outcome.decisions.length - 1];
    const fail = (msg: string) => {
      if (kind === "PASS") kind = "FAIL";
      details.push(`turn ${i + 1}: ${msg}`);
    };
    if (a.intent && decision?.intent !== a.intent) {
      fail(`intent expected ${a.intent}, got ${decision?.intent ?? "null"}`);
    }
    if (a.tool !== undefined) {
      if (decision?.tool !== a.tool) {
        fail(`planner tool expected ${a.tool}, got ${decision?.tool ?? "null"}`);
      }
      if (a.tool && !outcome.toolCalls.includes(a.tool)) {
        fail(`tool ${a.tool} not executed (got [${outcome.toolCalls.join(", ")}])`);
      }
    }
    for (const frag of a.replyContains ?? []) {
      if (!outcome.reply.toLowerCase().includes(frag.toLowerCase())) {
        fail(`reply must contain "${frag}"; got "${outcome.reply.slice(0, 80)}"`);
      }
    }
    for (const frag of a.replyMustNotContain ?? []) {
      if (outcome.reply.toLowerCase().includes(frag.toLowerCase())) {
        fail(`reply must NOT contain "${frag}"`);
      }
    }
    if (a.draftFact && outcome.draftAfter) {
      const actual =
        a.draftFact.key === "price"
          ? String(outcome.draftAfter.price ?? "")
          : String(
              ((outcome.draftAfter.attributes ?? {}) as Record<string, unknown>)[
                a.draftFact.key
              ] ?? ""
            );
      if (actual !== a.draftFact.value) {
        fail(`canonical ${a.draftFact.key} expected ${a.draftFact.value}, got ${actual}`);
      }
    }
    const confirmationPrefix = a.confirmationPrefix;
    if (confirmationPrefix && !outcome.confirmations.some((x) => x.startsWith(confirmationPrefix))) {
      fail(`missing confirmation ${confirmationPrefix}`);
    }
    for (const e of a.forbiddenEffects ?? []) {
      if (outcome.effects.includes(e)) {
        fail(`forbidden effect ${e} occurred`);
      }
    }
    for (const t of a.forbiddenTools ?? []) {
      if (outcome.toolCalls.includes(t)) {
        fail(`forbidden tool ${t} executed`);
      }
    }
  }
  return { kind, details };
}

async function main() {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    const report = [
      "# E2.2 — LIVE MODEL SPOT GATE — NOT RUN",
      "",
      "- Reason: GEMINI_API_KEY not available in this environment (no env var, no server/.env).",
      "- The deterministic suites remain the CI measure (golden 32/32, paraphrase 14/14, open-domain 33/33).",
      "- To run: `GEMINI_API_KEY=... LIVE_GOLDEN=1 npx tsx src/golden/run-golden-live-subset.ts`",
      "- This gate is MANDATORY before an E2.1/E2.2 FULL PASS lock.",
      "",
    ].join("\n");
    console.log(report);
    mkdirSync(resolve("audit-output/e2-live"), { recursive: true });
    writeFileSync(resolve("audit-output/e2-live/LIVE_SUBSET_NOT_RUN.md"), report, "utf8");
    process.exitCode = 2;
    return;
  }

  // Real production Agent Core path with the REAL Gemini adapter.
  setPlannerAdapterForTests(null);
  setPlannerDecisionProviderForTests(null);
  setThreadStoreForTests(new InMemoryThreadStore());
  setDefaultPendingActionStoreForTests(createInMemoryPendingActionStore());

  const app = createLiveApp();
  const lines: string[] = [
    "# E2.2 — LIVE MODEL SPOT GATE",
    "",
    `- Generated: ${new Date().toISOString()}`,
    `- Subset: ${LIVE_CASES.length} scenarios (real Gemini planner + tool loop, HTTP/SSE → ThreadService)`,
    "",
  ];
  let pass = 0;
  let errors = 0;
  let fails = 0;
  for (const c of LIVE_CASES) {
    try {
      const { outcomes } = await runCase(app, c);
      const verdict = evaluateCase(c, outcomes);
      if (verdict.kind === "PASS") {
        pass += 1;
        lines.push(`- [PASS] ${c.id} ${c.title}`);
      } else if (verdict.kind === "ERROR") {
        errors += 1;
        lines.push(`- [ERROR] ${c.id} ${c.title} — ${verdict.details.join("; ")}`);
        pushTraceLines(lines, outcomes);
      } else {
        fails += 1;
        lines.push(`- [FAIL] ${c.id} ${c.title} — ${verdict.details.join("; ")}`);
        pushTraceLines(lines, outcomes);
      }
    } catch (e) {
      errors += 1;
      lines.push(`- [ERROR] ${c.id} ${c.title} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  lines.push(
    "",
    `== LIVE SUBSET ${pass}/${LIVE_CASES.length} == (pass=${pass}, fail=${fails}, error=${errors})`,
    "",
    "> Not a CI gate — the deterministic suites are the CI measure."
  );
  const report = lines.join("\n");
  console.log(report);
  mkdirSync(resolve("audit-output/e2-live"), { recursive: true });
  writeFileSync(resolve("audit-output/e2-live/LIVE_SUBSET_REPORT.md"), report, "utf8");
  // E2.3 — the gate FAILS the process when ANY scenario fails/errors; the
  // exit code is only 0 when all 15 scenarios pass.
  process.exitCode = pass === LIVE_CASES.length && fails === 0 && errors === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
