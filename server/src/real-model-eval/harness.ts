/**
 * REAL-MODEL EVALUATION HARNESS — reuses the production Agent Core path.
 *
 * Runs each conversation through the REAL production HTTP/SSE route
 * (vautoAgentRouter → ThreadService → runVautoAgent → real Gemini planner +
 * tool loop), with isolated in-memory state. It mirrors the existing E2.2
 * live-model spot gate (src/golden/run-golden-live-subset.ts) — no agent,
 * planner, extraction, or correction logic is duplicated or bypassed.
 *
 * The ONLY things this harness stands in for are the external/data side
 * effects (in-memory thread store, in-memory consequential-action store,
 * isolated user/listings context resolver) — the model still decides what it
 * WOULD do, and consequential tool calls are recorded, never executed against
 * any external system.
 */
import express from "express";
import request from "supertest";

import { InMemoryThreadStore } from "../agent-core/thread-store.js";
import { setThreadStoreForTests } from "../agent-core/thread-store-instance.js";
import { optionalAuth } from "../middleware/auth.js";
import { vautoAgentRouter } from "../routes/vauto-agent.js";
import {
  setPlannerAdapterForTests,
  setPlannerDecisionProviderForTests,
  setPlannerDecisionObserverForTests,
  setPlannerTraceObserverForTests,
} from "../ai/planner/planner-orchestrator.js";
import type { PlannerDecision } from "../ai/planner/planner-types.js";
import { parseLiveStreamBody } from "../golden/harness/live-stream-parser.js";
import {
  createInMemoryPendingActionStore,
  setDefaultPendingActionStoreForTests,
} from "../ai/confirmation/consequential-action-policy.js";
import { signAccessToken } from "../auth/tokens.js";
import {
  resolveAuthenticatedContextFromServerState,
  setAgentUserContextResolverForTests,
} from "../ai/user-agent-context.js";
import type { EvalCase } from "./dataset.js";

/** Wire the REAL production planner/model path (no test adapter overrides). */
export function installRealModelSeams(): void {
  setPlannerAdapterForTests(null);
  setPlannerDecisionProviderForTests(null);
  setThreadStoreForTests(new InMemoryThreadStore());
  setDefaultPendingActionStoreForTests(createInMemoryPendingActionStore());
}

export function createEvalApp(): ReturnType<typeof express> {
  const app = express();
  app.use(express.json({ limit: "512kb" }));
  app.use(optionalAuth);
  app.use("/api/vauto-agent", vautoAgentRouter);
  return app;
}

export interface EvalTurnOutcome {
  index: number;
  text: string;
  reply: string;
  intent: string | null;
  tool: string | null;
  toolCalls: string[];
  subject?: string;
  needsClarification: boolean;
  clarificationQuestion: string | null;
  advisoryContext: boolean;
  activeTaskBefore?: string | null;
  activeTaskAfter?: string | null;
  searchFiltersBefore?: Record<string, unknown> | null;
  searchFiltersAfter?: Record<string, unknown> | null;
  draftBefore?: Record<string, unknown> | null;
  draftAfter: Record<string, unknown> | null;
  /** Planner decision tool args (query/filters/category as the planner sent them). */
  toolArgs: Record<string, unknown> | null;
  /** Canonical search vertical as observable from planner toolArgs + search sideEffect. */
  searchCategory?: string;
  confirmations: string[];
  effects: string[];
  consequentialEffects?: string[];
  model?: string;
  provider?: string;
  providerFailure?: boolean;
  error: { code: string; message: string } | null;
}

export interface EvalCaseOutcome {
  caseId: string;
  turns: EvalTurnOutcome[];
  modelsUsed: string[];
}

/**
 * Read the canonical search vertical from the production planner decision's
 * toolArgs (category / filters.category) or the search tool's sideEffect
 * filters — NOT from response text and NOT from a new classifier.
 */
function extractSearchCategory(
  toolArgs: Record<string, unknown> | undefined,
  searchFilters: Record<string, unknown> | undefined
): string | undefined {
  const direct = toolArgs?.category;
  if (typeof direct === "string" && direct.trim()) return direct.trim().toLowerCase();
  const filterObj = (toolArgs?.filters ?? searchFilters ?? {}) as Record<string, unknown>;
  const fc = filterObj.category;
  if (typeof fc === "string" && fc.trim()) return fc.trim().toLowerCase();
  return undefined;
}

/** Run one conversation through the real production route. */
export async function runEvalCase(
  app: ReturnType<typeof createEvalApp>,
  c: EvalCase
): Promise<EvalCaseOutcome> {
  const decisions: PlannerDecision[] = [];
  setPlannerDecisionObserverForTests((d) => decisions.push(d));
  const traces: Array<{ provider?: string; model?: string }> = [];
  setPlannerTraceObserverForTests((t) =>
    traces.push({ provider: t.provider, model: t.model })
  );

  let jwt: string | null = null;
  if (c.setup?.authUserId) {
    jwt = signAccessToken({ sub: c.setup.authUserId, role: "user" });
    const canonicalListings = (c.setup.myListings ?? []).map((l) => ({
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

  const turns: EvalTurnOutcome[] = [];
  try {
    let threadId: string | null = null;
    let anonToken: string | null = null;
    let draft: Record<string, unknown> | null =
      (c.setup?.initialDraft as Record<string, unknown> | undefined) ?? null;
    let activeTask: string | null = draft ? "sell" : null;
    let searchFilters: Record<string, unknown> | null = null;
    const confirmations: string[] = [];
    const effects: string[] = [];
    const consequentialEffects: string[] = [];

    for (let i = 0; i < c.turns.length; i++) {
      const turn = c.turns[i]!;
      const decisionIndexBefore = decisions.length;
      const traceIndexBefore = traces.length;
      const draftBefore = draft ? { ...draft } : null;
      const searchFiltersBefore = searchFilters ? { ...searchFilters } : null;
      const activeTaskBefore = activeTask;

      const res = await request(app)
        .post("/api/vauto-agent/stream")
        .set("authorization", jwt ? `Bearer ${jwt}` : "")
        .send({
          threadId: threadId ?? undefined,
          anonSessionToken: anonToken ?? undefined,
          turnId: `rme-${c.id}-${i + 1}`,
          messages: [{ role: "user", text: turn.text }],
          context: {
            // BLOCKER 4 — identity must be internally consistent: authenticated
            // only when a real eval JWT exists; guests are never "authenticated".
            isAuthenticated: Boolean(jwt),
            userCity: "Vilnius",
            contact: "+37060000000",
            profilePhone: "+37060000000",
            listingDraft: draft ?? undefined,
            listings: [],
          },
          authUserId: undefined,
        });

      const stream = parseLiveStreamBody(String(res.text ?? ""), {
        threadId,
        anonSessionToken: anonToken,
      });
      if (stream.threadId) threadId = stream.threadId;
      if (stream.anonSessionToken) anonToken = stream.anonSessionToken;

      const final = stream.finalResult;
      const reply = final?.reply ?? "";
      const toolCalls = final?.toolCalls.map((t) => t.name) ?? [];
      const actions = (final?.actions ?? {}) as Record<string, unknown>;
      if (actions.type === "listing_draft" && actions.listingDraft) {
        draft = actions.listingDraft as Record<string, unknown>;
        activeTask = "sell";
      } else if (actions.type === "search" || actions.type === "empty_search" || actions.type === "browse_all") {
        activeTask = "search";
        if (actions.filters && typeof actions.filters === "object") {
          searchFilters = actions.filters as Record<string, unknown>;
        }
      }

      for (const tc of toolCalls) {
        if (tc === "postNewListing") {
          effects.push("listing_published");
          consequentialEffects.push("listing_published");
        }
        if (tc === "deleteListing" || tc === "blockListing") {
          consequentialEffects.push("listing_blocked");
        }
        if (tc === "markListingSold") {
          consequentialEffects.push("listing_sold");
        }
        if (tc === "triggerMicroPayment") {
          consequentialEffects.push("payment_initiated");
        }
      }
      if (typeof actions.pendingActionId === "string" && actions.pendingActionId) {
        confirmations.push(`${String(actions.type ?? "")}:${actions.pendingActionId}`);
      }

      const decision = decisions[decisions.length - 1] ?? null;
      if (decision?.intent === "catalog_search") {
        activeTask = "search";
      } else if (
        decision?.intent === "sell_create" ||
        decision?.intent === "sell_update" ||
        decision?.intent === "sell_preview" ||
        decision?.intent === "sell_cancel" ||
        Boolean(draft)
      ) {
        activeTask = "sell";
      }
      const turnTraces = traces.slice(traceIndexBefore);
      const toolArgs = (decision?.toolArgs ?? null) as Record<string, unknown> | null;
      const searchCategory = extractSearchCategory(
        toolArgs ?? undefined,
        actions.filters as Record<string, unknown> | undefined
      );

      const providerFailure = Boolean(
        stream.errorEvent ||
        res.status >= 500
      );

      turns.push({
        index: i + 1,
        text: turn.text,
        reply,
        intent: decision?.intent ?? null,
        tool: decision?.tool ?? null,
        toolCalls,
        subject: decision?.subject,
        needsClarification: decision?.needsClarification ?? false,
        clarificationQuestion: decision?.clarificationQuestion ?? null,
        advisoryContext: decision?.advisoryContext ?? false,
        activeTaskBefore,
        activeTaskAfter: activeTask,
        searchFiltersBefore,
        searchFiltersAfter: searchFilters ? { ...searchFilters } : null,
        draftBefore,
        draftAfter: draft,
        toolArgs,
        searchCategory,
        confirmations: [...confirmations],
        effects: [...effects],
        consequentialEffects: [...consequentialEffects],
        model: turnTraces.find((t) => t.model)?.model,
        provider: turnTraces.find((t) => t.provider)?.provider,
        providerFailure,
        error: stream.errorEvent,
      });
    }
    return {
      caseId: c.id,
      turns,
      modelsUsed: Array.from(new Set(turns.map((t) => t.model).filter(Boolean) as string[])),
    };
  } finally {
    setAgentUserContextResolverForTests(null);
  }
}
