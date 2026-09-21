/**
 * VAUTO AI Core v2 — shadow isolation: Current Core stays authoritative and
 * user-visible; Core v2 is internal, read-only, and any shadow failure is
 * classified without ever breaking Current Core.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertShadowCapabilitiesReadOnly,
  runShadowTurn,
} from "../shadow/shadow-runner.js";
import { noopReasoningProvider } from "../reasoning/reasoning-loop.js";
import { emptyMarketplaceState, provenance } from "../state/marketplace-state.js";
import type { ReasoningProvider } from "../reasoning/reasoning-contract.js";
import type { CapabilityContract } from "../capability/capability.js";

const READ_CAP: CapabilityContract<unknown, unknown> = {
  name: "searchListings",
  description: "x",
  operation: "READ",
  validate: () => ({}),
  execute: async () => ({ ok: true }),
};

function baseOpts(provider: ReasoningProvider, overrides: Partial<Parameters<typeof runShadowTurn>[0]> = {}) {
  return {
    runCurrentCore: async () => ({ ok: true, reply: "Atsakymas", actions: { type: "none" } }),
    reasoningProvider: provider,
    buildReasoningInput: () => ({
      userTurn: "surask butus",
      history: [],
      state: emptyMarketplaceState(),
      capabilities: [],
    }),
    shadowCapabilities: [READ_CAP],
    ...overrides,
  };
}

describe("Core v2 — shadow harness", () => {
  it("Current Core result is authoritative and returned intact", async () => {
    const authoritative = { ok: true, reply: "Rezultatas" };
    const res = await runShadowTurn(
      baseOpts(noopReasoningProvider, { runCurrentCore: async () => authoritative })
    );
    assert.equal(res.authoritative, authoritative);
  });

  it("provider throw does NOT break Current Core (classified provider_error)", async () => {
    const provider: ReasoningProvider = async () => {
      throw new Error("boom");
    };
    const res = await runShadowTurn(baseOpts(provider));
    const auth = res.authoritative as { ok: boolean };
    assert.equal(auth.ok, true, "authoritative intact");
    assert.equal(res.shadow.kind, "failure");
    if (res.shadow.kind === "failure") assert.equal(res.shadow.code, "provider_error");
  });

  it("provider timeout does NOT break Current Core (classified timeout)", async () => {
    const provider: ReasoningProvider = async () => {
      await new Promise((r) => setTimeout(r, 50));
      return {};
    };
    const res = await runShadowTurn(baseOpts(provider, { providerTimeoutMs: 5 }));
    const auth = res.authoritative as { ok: boolean };
    assert.equal(auth.ok, true);
    assert.equal(res.shadow.kind, "failure");
    if (res.shadow.kind === "failure") assert.equal(res.shadow.code, "timeout");
  });

  it("malformed decision is classified malformed_result", async () => {
    const provider: ReasoningProvider = async () =>
      ({ text: 123 } as unknown as never);
    const res = await runShadowTurn(baseOpts(provider));
    assert.equal(res.shadow.kind, "failure");
    if (res.shadow.kind === "failure") assert.equal(res.shadow.code, "malformed_result");
  });

  it("state-transition failure is classified state_transition_error", async () => {
    const provider: ReasoningProvider = async () => ({
      statePatches: [{ op: "bogusOp" } as never],
    });
    const res = await runShadowTurn(baseOpts(provider));
    assert.equal(res.shadow.kind, "failure");
    if (res.shadow.kind === "failure") assert.equal(res.shadow.code, "state_transition_error");
  });

  it("capability-policy rejection is classified capability_policy_rejection", async () => {
    const consequential: CapabilityContract<unknown, unknown> = {
      name: "publish",
      description: "x",
      operation: "CONSEQUENTIAL",
      validate: () => ({}),
      execute: async () => ({ ok: true }),
    };
    const res = await runShadowTurn(baseOpts(noopReasoningProvider, { shadowCapabilities: [consequential] }));
    assert.equal(res.shadow.kind, "failure");
    if (res.shadow.kind === "failure") assert.equal(res.shadow.code, "capability_policy_rejection");
  });

  it("a healthy shadow applies state patches on a COPY and returns ok", async () => {
    const provider: ReasoningProvider = async () => ({
      statePatches: [
        { op: "setHard", key: "priceMax", value: 150000, provenance: provenance("USER_STATED") },
      ],
    });
    const res = await runShadowTurn(baseOpts(provider));
    assert.equal(res.shadow.kind, "ok");
    if (res.shadow.kind === "ok") {
      assert.equal(res.shadow.nextState.hardConstraints.priceMax, 150000);
    }
  });

  it("assertShadowCapabilitiesReadOnly rejects non-READ capabilities", () => {
    assertShadowCapabilitiesReadOnly([READ_CAP]);
    assert.throws(
      () =>
        assertShadowCapabilitiesReadOnly([
          { name: "publish", description: "x", operation: "CONSEQUENTIAL", validate: () => ({}), execute: async () => ({ ok: true }) },
        ]),
      /READ-only/
    );
  });
});
