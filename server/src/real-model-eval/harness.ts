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
  draftAfter: Record<string, unknown> | null;
  confirmations: string[];
  effects: string[];
  model?: string;
  provider?: string;
  error: { code: string; message: string } | null;
}

export interface EvalCaseOutcome {
  caseId: string;
  turns: EvalTurnOutcome[];
  modelsUsed: string[];
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
    const confirmations: string[] = [];
    const effects: string[] = [];

    for (let i = 0; i < c.turns.length; i++) {
      const turn = c.turns[i]!;
      const decisionIndexBefore = decisions.length;
      const traceIndexBefore = traces.length;

      const res = await request(app)
        .post("/api/vauto-agent/stream")
        .set("authorization", jwt ? `Bearer ${jwt}` : "")
        .send({
          threadId: threadId ?? undefined,
          anonSessionToken: anonToken ?? undefined,
          turnId: `rme-${c.id}-${i + 1}`,
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
      }
      for (const tc of toolCalls) {
        if (tc === "postNewListing") effects.push("listing_published");
      }
      if (typeof actions.pendingActionId === "string" && actions.pendingActionId) {
        confirmations.push(`${String(actions.type ?? "")}:${actions.pendingActionId}`);
      }

      const decision = decisions[decisions.length - 1] ?? null;
      const turnTraces = traces.slice(traceIndexBefore);

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
        draftAfter: draft,
        confirmations: [...confirmations],
        effects: [...effects],
        model: turnTraces.find((t) => t.model)?.model,
        provider: turnTraces.find((t) => t.provider)?.provider,
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
