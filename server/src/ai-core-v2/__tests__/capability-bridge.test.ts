/**
 * VAUTO AI Core v2.4 — universal capability bridge (deterministic, no network).
 *
 * Proves the coherent capability boundary:
 *  A. capability boundary (model requests, never bypasses);
 *  B. operation-class / authorization / confirmation classification;
 *  C. argument safety (validate);
 *  D. grounding/provenance (tool facts are never USER_STATED);
 *  E. one coherent multi-turn READ -> PREPARE -> CONSEQUENTIAL flow.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMarketplaceRegistry } from "../capability/registry.js";
import { prepareListingDraftCapability } from "../capability/capabilities/prepare-listing-draft.js";
import { createPublishListingCapability } from "../capability/capabilities/publish-listing.js";
import { CapabilityRegistry } from "../capability/registry.js";
import type { CapabilityContract, CapabilityOperation } from "../capability/capability.js";
import { runMultiStepLoop } from "../loop/multi-step-loop.js";
import type { ReasoningDecision, ReasoningInput, ReasoningProvider } from "../reasoning/reasoning-contract.js";
import { emptyMarketplaceState } from "../state/marketplace-state.js";

function mkCap(name: string, operation: CapabilityOperation, data?: unknown): CapabilityContract<unknown, unknown> {
  return {
    name,
    description: name,
    operation,
    validate: (a) => a,
    execute: async () => ({ ok: true, data, provenance: "TOOL_DERIVED" as const }),
  };
}

function scripted(decisions: ReasoningDecision[]): ReasoningProvider {
  let i = 0;
  return async () => decisions[Math.min(i++, decisions.length - 1)] ?? {};
}

function inp(capabilities: Array<{ name: string; description: string; operation: CapabilityOperation }>): ReasoningInput {
  return { userTurn: "x", history: [], state: emptyMarketplaceState(), capabilities };
}

describe("v2.4 — capability bridge: contract + classification", () => {
  it("marketplace registry declares READ/PREPARE/CONSEQUENTIAL correctly", () => {
    const r = createMarketplaceRegistry();
    const byName = Object.fromEntries(r.describe().map((c) => [c.name, c]));
    assert.equal(byName.searchListings?.operation, "READ");
    assert.equal(byName.listingDetails?.operation, "READ");
    assert.equal(byName.prepareListingDraft?.operation, "PREPARE");
    assert.equal(byName.publishListing?.operation, "CONSEQUENTIAL");
    assert.equal(byName.publishListing?.requiresConfirmation, true);
  });

  it("prepareListingDraft validates args strictly and stages a MODEL_INFERRED draft (no persistence)", async () => {
    assert.throws(() => prepareListingDraftCapability.validate({ title: "", category: "vehicles" }));
    assert.throws(() => prepareListingDraftCapability.validate({ title: "x", category: "vehicles", price: -5 }));
    const res = await prepareListingDraftCapability.execute(
      { title: "BMW 320d", category: "vehicles", price: 15000, city: "Vilnius" },
      {}
    );
    assert.equal(res.ok, true);
    assert.equal(res.provenance, "MODEL_INFERRED", "draft is a proposal, not authoritative");
    assert.equal(res.data?.status, "draft");
    assert.equal(res.data?.location, "Vilnius");
  });

  it("publishListing refuses without confirmation (persist NOT invoked)", async () => {
    let called = false;
    const cap = createPublishListingCapability(async () => { called = true; });
    const res = await cap.execute({ title: "BMW", category: "vehicles", price: 15000 }, { authUserId: "u1", confirmed: false });
    assert.equal(res.ok, false);
    assert.equal(res.failureKind, "confirmation_required");
    assert.equal(called, false, "consequential action must not run before confirmation");
  });

  it("publishListing refuses without authenticated seller", async () => {
    const cap = createPublishListingCapability(async () => {});
    const res = await cap.execute({ title: "BMW", category: "vehicles" }, { confirmed: true });
    assert.equal(res.ok, false);
    assert.equal(res.failureKind, "authorization");
  });

  it("publishListing bridges to persistence only with auth + confirmation (TOOL_DERIVED)", async () => {
    const persisted: Array<{ title: string; sellerId: string; category: string }> = [];
    const cap = createPublishListingCapability(async (l) => {
      persisted.push({ title: l.title, sellerId: l.sellerId, category: l.category });
    });
    const res = await cap.execute(
      { title: "BMW 320d", category: "vehicles", price: 15000 },
      { authUserId: "u1", confirmed: true }
    );
    assert.equal(res.ok, true);
    assert.equal(res.provenance, "TOOL_DERIVED");
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0]!.sellerId, "u1");
    assert.equal(persisted[0]!.title, "BMW 320d");
  });
});

describe("v2.4 — capability bridge: multi-step loop gate", () => {
  it("PREPARE executes in the loop and carries TOOL_DERIVED provenance", async () => {
    const registry = new CapabilityRegistry();
    registry.register(mkCap("prepareListingDraft", "PREPARE", { status: "draft" }));
    let seen: unknown;
    const provider: ReasoningProvider = async (i) => {
      if (!i.groundedResults?.length) {
        return { capabilityRequest: { capability: "prepareListingDraft", args: { title: "x", category: "vehicles" } } };
      }
      seen = i.groundedResults[0];
      return { text: "paruošta" };
    };
    const res = await runMultiStepLoop({ provider, registry, input: inp([{ name: "prepareListingDraft", description: "x", operation: "PREPARE" }]) });
    assert.equal(res.capabilityCalls.length, 1);
    assert.equal(res.capabilityCalls[0]!.ok, true);
    assert.equal((seen as { provenance?: string } | undefined)?.provenance, "TOOL_DERIVED");
  });

  it("CONSEQUENTIAL is not auto-executed (confirmation boundary surfaced)", async () => {
    let executed = false;
    const registry = new CapabilityRegistry();
    registry.register({
      name: "publishListing",
      description: "x",
      operation: "CONSEQUENTIAL",
      validate: (a) => a,
      execute: async () => { executed = true; return { ok: true }; },
    });
    const provider = scripted([{ capabilityRequest: { capability: "publishListing", args: {} } }, { text: "ok" }]);
    const res = await runMultiStepLoop({ provider, registry, input: inp([{ name: "publishListing", description: "x", operation: "CONSEQUENTIAL" }]) });
    assert.equal(res.capabilityCalls[0]!.ok, false);
    assert.equal(res.capabilityCalls[0]!.error, "confirmation_required");
    assert.equal(executed, false, "consequential execute never runs in the reasoning loop");
  });

  it("MUTATE requires an authenticated actor in the loop", async () => {
    const registry = new CapabilityRegistry();
    registry.register(mkCap("updateListing", "MUTATE"));
    const provider = scripted([{ capabilityRequest: { capability: "updateListing", args: {} } }, { text: "ok" }]);
    const res = await runMultiStepLoop({ provider, registry, input: inp([{ name: "updateListing", description: "x", operation: "MUTATE" }]) });
    assert.equal(res.capabilityCalls[0]!.ok, false);
    assert.equal(res.capabilityCalls[0]!.error, "authorization");
  });

  it("coherent multi-turn flow: READ -> PREPARE -> CONSEQUENTIAL(confirmation)", async () => {
    const registry = new CapabilityRegistry();
    registry.register(mkCap("searchListings", "READ", { count: 2, listings: [{ title: "BMW" }, { title: "Audi" }] }));
    registry.register(mkCap("prepareListingDraft", "PREPARE", { status: "draft" }));
    registry.register({
      name: "publishListing",
      description: "x",
      operation: "CONSEQUENTIAL",
      validate: (a) => a,
      execute: async () => ({ ok: true }),
    });
    const provider = scripted([
      { capabilityRequest: { capability: "searchListings", args: {} } },
      { capabilityRequest: { capability: "prepareListingDraft", args: { title: "BMW", category: "vehicles" } } },
      { capabilityRequest: { capability: "publishListing", args: {} } },
      { text: "Ar patvirtinate skelbimo paskelbimą?" },
    ]);
    const caps = [
      { name: "searchListings", description: "x", operation: "READ" as const },
      { name: "prepareListingDraft", description: "x", operation: "PREPARE" as const },
      { name: "publishListing", description: "x", operation: "CONSEQUENTIAL" as const },
    ];
    const res = await runMultiStepLoop({ provider, registry, input: inp(caps) });
    // READ + PREPARE executed; CONSEQUENTIAL surfaced confirmation.
    assert.equal(res.capabilityCalls.length, 3);
    assert.equal(res.capabilityCalls[0]!.name, "searchListings");
    assert.equal(res.capabilityCalls[0]!.ok, true);
    assert.equal(res.capabilityCalls[1]!.name, "prepareListingDraft");
    assert.equal(res.capabilityCalls[1]!.ok, true);
    assert.equal(res.capabilityCalls[2]!.name, "publishListing");
    assert.equal(res.capabilityCalls[2]!.ok, false);
    assert.equal(res.capabilityCalls[2]!.error, "confirmation_required");
    assert.equal(res.decision.capabilityRequest?.capability, "publishListing");
  });
});
