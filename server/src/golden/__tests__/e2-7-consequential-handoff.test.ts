/**
 * E2.7 — FINAL LIVE-12 canonical-target handoff, proven through the REAL
 * HTTP/SSE → ThreadService → planner → confirmation boundary path.
 *
 * The route boundary (correctly) trusts ONLY canonical server state: the
 * tests install the isolated server-state seam (user + listings — the
 * stand-in for the database, exactly like the scripted model provider
 * stands in for Gemini) plus a REAL signed JWT. Client-supplied listings
 * in the HTTP body remain untrusted.
 *
 * Invariants proven:
 *  1. resolved single legitimate target → server-authoritative id →
 *     confirmation boundary → pendingActionId (NO mutation);
 *  2. multiple targets → clarification, no pendingActionId;
 *  3. no targets → clarification, no pendingActionId;
 *  4. a model-supplied FAKE listing id is rejected (never executed).
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import express from "express";
import request from "supertest";

import { InMemoryThreadStore } from "../../agent-core/thread-store.js";
import { setThreadStoreForTests } from "../../agent-core/thread-store-instance.js";
import { optionalAuth } from "../../middleware/auth.js";
import { vautoAgentRouter } from "../../routes/vauto-agent.js";
import { signAccessToken } from "../../auth/tokens.js";
import {
  resolveAuthenticatedContextFromServerState,
  setAgentUserContextResolverForTests,
} from "../../ai/user-agent-context.js";
import {
  createInMemoryPendingActionStore,
  setDefaultPendingActionStoreForTests,
} from "../../ai/confirmation/consequential-action-policy.js";
import { setPlannerAdapterForTests, setPlannerDecisionObserverForTests } from "../../ai/planner/planner-orchestrator.js";
import type { PlannerLlmAdapter, PlannerStructuredRequest, PlannerStructuredResponse } from "../../ai/planner/planner-provider.js";
import {
  createScriptedModelProvider,
  fc,
  round,
  text,
} from "../harness/scripted-model-provider.js";
import { parseLiveStreamBody } from "../harness/live-stream-parser.js";

afterEach(() => {
  setThreadStoreForTests(null);
  setPlannerAdapterForTests(null);
  setPlannerDecisionObserverForTests(null);
  setAgentUserContextResolverForTests(null);
  delete process.env.GEMINI_API_KEY;
});

function createApp() {
  const app = express();
  app.use(express.json({ limit: "512kb" }));
  app.use(optionalAuth);
  app.use("/api/vauto-agent", vautoAgentRouter);
  return app;
}

interface CanonicalListing {
  id: string;
  title: string;
  status?: string;
}

/** The dialog-hedged planner failure mode observed in LIVE-12. */
function hedgedPlanner(toolArgs: Record<string, unknown> = {}): PlannerLlmAdapter {
  return {
    providerId: "fake-hedged",
    async planStructured(_req: PlannerStructuredRequest): Promise<PlannerStructuredResponse> {
      return {
        args: {
          intent: "dialog",
          goal: "hedged",
          continuationOf: "none",
          action: "dialog_reply",
          tool: null,
          toolArgs,
          needsClarification: true,
          clarificationQuestion: "Kurį skelbimą?",
          confidence: 0.6,
          reasons: ["hedged"],
        },
        provider: "fake-hedged",
        model: "h-1",
      };
    },
  };
}

function installServerState(
  userId: string,
  listings: CanonicalListing[]
): void {
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
      listings.map((l) => ({
        id: l.id,
        title: l.title,
        price: 0,
        category: "vehicles",
        location: "Vilnius",
        status: l.status ?? "active",
      })),
      clientFallback
    );
  });
}

async function runConsequentialTurn(
  app: ReturnType<typeof createApp>,
  listingArgs: Record<string, unknown>,
  scripted: "tool" | "clarify"
): Promise<{
  stream: ReturnType<typeof parseLiveStreamBody>;
  decisions: Array<import("../../ai/planner/planner-types.js").PlannerDecision>;
}> {
  setThreadStoreForTests(new InMemoryThreadStore());
  setDefaultPendingActionStoreForTests(createInMemoryPendingActionStore());
  setPlannerAdapterForTests(hedgedPlanner(listingArgs));
  const decisions: Array<import("../../ai/planner/planner-types.js").PlannerDecision> = [];
  setPlannerDecisionObserverForTests((d) => decisions.push(d));
  process.env.GEMINI_API_KEY = "e27-test-key";
  const jwt = signAccessToken({ sub: "user-e27", role: "user" });
  const recorder = createScriptedModelProvider({
    turns: [
      [
        scripted === "tool"
          ? round(fc("markListingSold", { listingId: "lt-1" }))
          : round(text("Prašau patikslinti, kurį skelbimą pažymėti parduotu.")),
      ],
    ],
    exhausted: { parts: [] },
  });
  const prev = recorder.install();
  try {
    const res = await request(app)
      .post("/api/vauto-agent/stream")
      .set("authorization", `Bearer ${jwt}`)
      .send({
        turnId: "e27-1",
        messages: [{ role: "user", text: "Pažymėk skelbimą parduotu" }],
        context: {
          isAuthenticated: true,
          userCity: "Vilnius",
          contact: "+37060000000",
          profilePhone: "+37060000000",
        },
      });
    return { stream: parseLiveStreamBody(String(res.text ?? "")), decisions };
  } finally {
    recorder.restore();
    if (prev) globalThis.fetch = prev;
    setPlannerDecisionObserverForTests(null);
  }
}

describe("E2.7 — LIVE-12 canonical-target handoff (real HTTP/ThreadService path)", () => {
  it("resolved SINGLE legitimate target → confirmation boundary → pendingActionId, NO mutation", async () => {
    installServerState("user-e27", [{ id: "lt-1", title: "Mano Volvo" }]);
    const app = createApp();
    const { stream, decisions } = await runConsequentialTurn(app, {}, "tool");

    const decision = decisions[decisions.length - 1]!;
    assert.equal(decision.needsClarification, false, "coherent resolved plan");
    assert.equal((decision.toolArgs as { listingId?: string }).listingId, "lt-1", "server-authoritative id");

    assert.ok(stream.finalResult, "final event arrived");
    assert.ok(
      stream.finalResult!.toolCalls.some((t) => t.name === "markListingSold"),
      "markListingSold executed through the model tool loop"
    );
    const actions = stream.finalResult!.actions as Record<string, unknown>;
    assert.ok(
      typeof actions.pendingActionId === "string" && actions.pendingActionId,
      "pendingActionId present (confirmation boundary entered)"
    );
    assert.ok(!stream.rawText.includes("listing_published"), "NO direct mutation");
  });

  it("MULTIPLE targets → clarification, no pendingActionId, no tool call", async () => {
    installServerState("user-e27", [
      { id: "lt-1", title: "Volvo" },
      { id: "lt-2", title: "BMW" },
    ]);
    const app = createApp();
    const { stream, decisions } = await runConsequentialTurn(app, {}, "clarify");

    const decision = decisions[decisions.length - 1]!;
    assert.equal(decision.needsClarification, true, "ambiguity keeps clarification");
    assert.ok(stream.finalResult);
    assert.ok(
      !stream.finalResult!.toolCalls.some((t) => t.name === "markListingSold"),
      "no tool call when the target is ambiguous"
    );
    const actions = stream.finalResult!.actions as Record<string, unknown>;
    assert.equal(actions.pendingActionId, undefined, "no pendingActionId");
    assert.match(stream.finalResult!.reply, /patikslinti/i);
  });

  it("NO targets → clarification, no pendingActionId", async () => {
    installServerState("user-e27", []);
    const app = createApp();
    const { stream, decisions } = await runConsequentialTurn(app, {}, "clarify");

    const decision = decisions[decisions.length - 1]!;
    assert.equal(decision.needsClarification, true);
    assert.ok(stream.finalResult);
    assert.ok(!stream.finalResult!.toolCalls.some((t) => t.name === "markListingSold"));
    assert.equal(
      (stream.finalResult!.actions as Record<string, unknown>).pendingActionId,
      undefined
    );
  });

  it("model-supplied FAKE listing id is rejected — the server-authoritative single target wins", async () => {
    installServerState("user-e27", [{ id: "lt-1", title: "Mano Volvo" }]);
    const app = createApp();
    const { stream, decisions } = await runConsequentialTurn(
      app,
      { listingId: "forged-999" },
      "tool"
    );

    const decision = decisions[decisions.length - 1]!;
    assert.equal(
      (decision.toolArgs as { listingId?: string }).listingId,
      "lt-1",
      "the forged id never becomes the target — canonical id wins"
    );
    const actions = stream.finalResult!.actions as Record<string, unknown>;
    assert.ok(
      typeof actions.pendingActionId === "string" && actions.pendingActionId,
      "resolved to the CANONICAL listing (not the forged id)"
    );
  });

  it("model-supplied fake id with MULTIPLE canonical targets → clarification (rejected)", async () => {
    installServerState("user-e27", [
      { id: "lt-1", title: "Volvo" },
      { id: "lt-2", title: "BMW" },
    ]);
    const app = createApp();
    const { stream, decisions } = await runConsequentialTurn(
      app,
      { listingId: "forged-999" },
      "clarify"
    );

    const decision = decisions[decisions.length - 1]!;
    assert.equal(decision.needsClarification, true, "forged id never resolves a target");
    assert.ok(stream.finalResult);
    assert.ok(!stream.finalResult!.toolCalls.some((t) => t.name === "markListingSold"));
    assert.equal(
      (stream.finalResult!.actions as Record<string, unknown>).pendingActionId,
      undefined,
      "no confirmation minted for a forged id"
    );
  });
});
