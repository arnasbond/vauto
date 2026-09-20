/**
 * R2-H3.3 — an unexpected internal failure must NOT masquerade as successful
 * AI reasoning, and must NOT reuse the legacy listing/search/draft recovery
 * string. The user must get a truthful visible retry state (H3.1 invariant:
 * a user turn never ends silently).
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { runVautoAgent } from "../vauto-agent.js";
import { setPlannerDecisionProviderForTests } from "../planner/planner-orchestrator.js";
import {
  VAUTO_IN_DOMAIN_RECOVERY,
  VAUTO_INTERNAL_ERROR_REPLY,
} from "../../shared/vauto-domain-autonomy.js";

afterEach(() => {
  setPlannerDecisionProviderForTests(null);
  delete process.env.GEMINI_API_KEY;
});

function requestFor(text: string) {
  return {
    messages: [{ role: "user", text }],
    context: { userCity: "Kaunas", isAuthenticated: true },
  } as Parameters<typeof runVautoAgent>[0];
}

describe("R2-H3.3 — masked internal failure", () => {
  it("an unexpected internal exception is NOT masked as the legacy recovery", async () => {
    // A planner provider that throws an UNEXPECTED (non-AgentRouteError) error
    // propagates through resolvePlannerDecision (uncaught there) to the
    // runVautoAgent outer catch.
    setPlannerDecisionProviderForTests(async () => {
      throw new TypeError("boom internal failure");
    });
    process.env.GEMINI_API_KEY = "test-key";

    const res = await runVautoAgent(requestFor("man reiketu surasti busta kaune"));

    assert.equal(res.ok, true);
    assert.notEqual(res.reply, VAUTO_IN_DOMAIN_RECOVERY, "must not reuse the misleading recovery");
    assert.equal(res.reply, VAUTO_INTERNAL_ERROR_REPLY, "must return a truthful retry state");
    assert.ok(String(res.reply ?? "").trim().length > 0, "never silent");
  });

  it("the internal-error reply is truthful, not a fabricated success", () => {
    assert.match(VAUTO_INTERNAL_ERROR_REPLY, /netikėta klaida|klaida/i);
    assert.match(VAUTO_INTERNAL_ERROR_REPLY, /bandykite|kiek vėliau/i);
  });
});
