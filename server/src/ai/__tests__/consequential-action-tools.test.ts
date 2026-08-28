/**
 * VAUTO AI Maturity — Phase 1: Consequential Action Confirmation Boundary.
 *
 * Proves the actual tool-call surface (executeAgentTool) for
 * `markListingSold` / `blockListing` NEVER touches the database. These
 * tests run with `ctx.listingsSnapshot` populated so `resolveListings()`
 * (called unconditionally by `executeAgentTool` before dispatch) also never
 * reaches for a live DB connection — i.e. this whole test suite is
 * self-verifying: if any code path attempted a real Postgres query, it
 * would fail/hang against the unreachable `postgresql://vauto:vauto@
 * localhost:5432/vauto` default in this DB-less test environment. A clean,
 * fast pass is itself proof of zero DB mutation.
 */

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { executeAgentTool, type AgentToolContext } from "../agent-tools.js";
import type { MyListingForAgent } from "../user-agent-context.js";
import {
  createInMemoryPendingActionStore,
  setDefaultPendingActionStoreForTests,
} from "../confirmation/consequential-action-policy.js";

// The confirmation boundary is UNAVAILABLE (fail-closed) by default (2nd
// audit, remediation B) — this test file explicitly opts in to a ready
// in-memory store, exactly as production wiring would opt in to Postgres.
before(() => {
  setDefaultPendingActionStoreForTests(createInMemoryPendingActionStore());
});

const LISTINGS_SNAPSHOT_BYPASS = [
  { id: "snapshot-listing", title: "Snapshot", price: 1, category: "other", location: "Vilnius" },
];

function baseCtx(overrides: Partial<AgentToolContext> = {}): AgentToolContext {
  return {
    userCity: "Vilnius",
    userRole: "seller",
    contact: "",
    listingsSnapshot: LISTINGS_SNAPSHOT_BYPASS,
    ...overrides,
  };
}

describe("markListingSold tool call — proposal only, zero DB mutation", () => {
  it("returns a pending proposal, never an already-executed result", async () => {
    const myListings: MyListingForAgent[] = [
      { id: "listing-1", title: "BMW 320d", price: 8000, category: "vehicles", location: "Vilnius", status: "active" },
    ];
    const ctx = baseCtx({ authUserId: "user-1", myListings });

    const { result, sideEffect } = await executeAgentTool("markListingSold", {}, ctx);

    const r = result as {
      ok: boolean;
      pending?: boolean;
      pendingActionId?: string;
      listingId?: string;
    };
    assert.equal(r.ok, true);
    assert.equal(r.pending, true);
    assert.equal(r.listingId, "listing-1");

    // Audit remediation #4 — `result` is what gets echoed verbatim into the
    // Gemini functionResponse content (the LLM's own next-turn context).
    // pendingActionId must NEVER appear there; it is only valid in the
    // trusted client-side sideEffect channel below.
    assert.equal(
      "pendingActionId" in r,
      false,
      "pendingActionId must not be present in the LLM-visible tool result"
    );
    assert.doesNotMatch(
      JSON.stringify(result),
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      "no UUID-shaped value may leak into the LLM-visible tool result"
    );

    assert.ok(sideEffect);
    assert.equal(sideEffect!.type, "mark_listing_sold");
    if (sideEffect!.type === "mark_listing_sold") {
      assert.ok(sideEffect!.pendingActionId, "the trusted sideEffect channel must carry the opaque id");
      assert.match(sideEffect!.pendingActionId, /^[0-9a-f-]{36}$/i);
      assert.ok(sideEffect!.expiresAt);
      assert.ok(new Date(sideEffect!.expiresAt).getTime() > Date.now());
    }
  });

  it("declines to propose for an unauthenticated caller (no userId to bind the proposal to)", async () => {
    const myListings: MyListingForAgent[] = [
      { id: "listing-1", title: "BMW 320d", price: 8000, category: "vehicles", location: "Vilnius", status: "active" },
    ];
    const ctx = baseCtx({ authUserId: undefined, myListings });

    const { result, sideEffect } = await executeAgentTool("markListingSold", {}, ctx);
    const r = result as { ok: boolean };
    assert.equal(r.ok, false);
    assert.equal(sideEffect, undefined);
  });

  it("still fails safely (ambiguous target) with no listings — no proposal minted", async () => {
    const ctx = baseCtx({ authUserId: "user-1", myListings: [] });
    const { result, sideEffect } = await executeAgentTool("markListingSold", {}, ctx);
    const r = result as { ok: boolean };
    assert.equal(r.ok, false);
    assert.equal(sideEffect, undefined);
  });
});

describe("blockListing tool call — proposal only, zero DB mutation", () => {
  it("returns a pending proposal for an admin caller, never an already-executed result", async () => {
    const ctx = baseCtx({ authUserId: "admin-1", userRole: "admin" });

    const { result, sideEffect } = await executeAgentTool(
      "blockListing",
      { listingId: "listing-9", reason: "suspicious" },
      ctx
    );

    const r = result as {
      ok: boolean;
      pending?: boolean;
      pendingActionId?: string;
      listingId?: string;
    };
    assert.equal(r.ok, true);
    assert.equal(r.pending, true);
    assert.equal(r.listingId, "listing-9");

    // Audit remediation #4 — see the matching assertion in the
    // markListingSold test above.
    assert.equal(
      "pendingActionId" in r,
      false,
      "pendingActionId must not be present in the LLM-visible tool result"
    );

    assert.ok(sideEffect);
    assert.equal(sideEffect!.type, "block_listing");
    if (sideEffect!.type === "block_listing") {
      assert.ok(sideEffect!.pendingActionId, "the trusted sideEffect channel must carry the opaque id");
      assert.match(sideEffect!.pendingActionId, /^[0-9a-f-]{36}$/i);
      assert.ok(sideEffect!.expiresAt);
    }
  });

  it("rejects non-admin callers before any proposal is minted", async () => {
    const ctx = baseCtx({ authUserId: "user-1", userRole: "buyer" });
    const { result, sideEffect } = await executeAgentTool(
      "blockListing",
      { listingId: "listing-9", reason: "x" },
      ctx
    );
    const r = result as { ok: boolean };
    assert.equal(r.ok, false);
    assert.equal(sideEffect, undefined);
  });

  it("rejects when the admin proposal-time role snapshot has no bound userId", async () => {
    const ctx = baseCtx({ authUserId: undefined, userRole: "admin" });
    const { result, sideEffect } = await executeAgentTool(
      "blockListing",
      { listingId: "listing-9", reason: "x" },
      ctx
    );
    const r = result as { ok: boolean };
    assert.equal(r.ok, false);
    assert.equal(sideEffect, undefined);
  });
});

describe("AUDIT B — confirmation boundary fail-closed during bootstrap (tool surface)", () => {
  it("mints NO proposal while the boundary is UNAVAILABLE — fails safely instead", async () => {
    const { resetConfirmationBoundaryForTests } = await import(
      "../confirmation/consequential-action-policy.js"
    );
    resetConfirmationBoundaryForTests();
    try {
      const myListings: MyListingForAgent[] = [
        { id: "listing-1", title: "BMW 320d", price: 8000, category: "vehicles", location: "Vilnius", status: "active" },
      ];
      const ctx = baseCtx({ authUserId: "user-1", myListings });

      const { result, sideEffect } = await executeAgentTool("markListingSold", {}, ctx);
      const r = result as { ok: boolean; message?: string };
      assert.equal(r.ok, false, "no pending action must be minted while unavailable");
      assert.equal(sideEffect, undefined, "no sideEffect — nothing to confirm client-side");

      const admin = baseCtx({ authUserId: "admin-1", userRole: "admin" });
      const blockResult = await executeAgentTool(
        "blockListing",
        { listingId: "listing-9", reason: "x" },
        admin
      );
      const br = blockResult.result as { ok: boolean };
      assert.equal(br.ok, false);
      assert.equal(blockResult.sideEffect, undefined);
    } finally {
      // Restore the ready state this whole test file's `before()` installed,
      // so later tests/files are unaffected by this one's simulated bootstrap.
      setDefaultPendingActionStoreForTests(createInMemoryPendingActionStore());
    }
  });
});
