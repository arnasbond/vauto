/**
 * Stage 11A — pure state-machine + matrix + schema tests (no DB).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACTOR_TYPES,
  HAPPY_PATH_STATUSES,
  InvalidTransitionError,
  TERMINAL_STATUSES,
  TRANSACTION_STATUSES,
  TRANSITION_MATRIX,
  TRANSACTION_STATE_MACHINE_VERSION,
  LEGACY_TRANSACTION_POLICY,
  TransitionCommandSchema,
  VautoTransactionSchema,
  applyTransitionPure,
  assertTransitionAllowed,
  computeStateHash,
  findTransitionEdge,
  isTerminalStatus,
  listAllowedTargets,
  verifyAuditChain,
  buildAuditRecord,
  type ActorType,
  type ReasonCode,
  type TransactionStatus,
  type VautoTransaction,
} from "../index.js";

function baseTx(status: TransactionStatus, version = 0): VautoTransaction {
  return {
    id: "tx-1",
    listingId: "L1",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    status,
    currentPrice: 100,
    currency: "EUR",
    version,
    idempotencyKey: null,
    stateMachineVersion: TRANSACTION_STATE_MACHINE_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...LEGACY_TRANSACTION_POLICY,
  };
}

/** Canonical happy-path steps with actor + reason. */
const HAPPY_STEPS: Array<{
  to: TransactionStatus;
  actor: ActorType;
  reason: ReasonCode;
}> = [
  { to: "OFFER_PENDING", actor: "BUYER", reason: "OFFER_SUBMITTED" },
  { to: "NEGOTIATING", actor: "SELLER", reason: "COUNTER_OFFER" },
  { to: "AGREED", actor: "BUYER", reason: "OFFER_ACCEPTED" },
  { to: "PAYMENT_PENDING", actor: "SYSTEM", reason: "PAYMENT_REQUESTED" },
  { to: "PAID", actor: "SYSTEM", reason: "PAYMENT_CONFIRMED" },
  { to: "SHIPPING_PENDING", actor: "SELLER", reason: "SHIPMENT_READY" },
  { to: "SHIPPED", actor: "SELLER", reason: "SHIPPED_CONFIRMED" },
  { to: "DELIVERED", actor: "BUYER", reason: "DELIVERY_CONFIRMED" },
  { to: "COMPLETED", actor: "SYSTEM", reason: "COMPLETION_CONFIRMED" },
];

describe("11A version & schemas", () => {
  it("exports stateMachineVersion 1.0", () => {
    assert.equal(TRANSACTION_STATE_MACHINE_VERSION, "1.0");
  });

  it("parses valid transaction schema", () => {
    const parsed = VautoTransactionSchema.parse(baseTx("DISCUSSION"));
    assert.equal(parsed.stateMachineVersion, "1.0");
  });

  it("rejects unknown status in schema", () => {
    assert.throws(() =>
      VautoTransactionSchema.parse({ ...baseTx("DISCUSSION"), status: "PAID_NOW" })
    );
  });

  it("transition command requires idempotencyKey length >= 8", () => {
    assert.throws(() =>
      TransitionCommandSchema.parse({
        transactionId: "t",
        expectedVersion: 0,
        toStatus: "CANCELLED",
        actorType: "BUYER",
        actorId: "b",
        idempotencyKey: "short",
        reasonCode: "BUYER_CANCELLED",
      })
    );
  });

  it("accepts valid transition command", () => {
    const c = TransitionCommandSchema.parse({
      transactionId: "t",
      expectedVersion: 0,
      toStatus: "OFFER_PENDING",
      actorType: "BUYER",
      actorId: "b",
      idempotencyKey: "idem-key-01",
      reasonCode: "OFFER_SUBMITTED",
    });
    assert.equal(c.toStatus, "OFFER_PENDING");
  });
});

describe("11A transition matrix completeness", () => {
  it("defines every status key", () => {
    for (const s of TRANSACTION_STATUSES) {
      assert.ok(s in TRANSITION_MATRIX, `missing matrix key ${s}`);
    }
  });

  it("terminal statuses have empty outbound", () => {
    for (const s of TERMINAL_STATUSES) {
      assert.equal(TRANSITION_MATRIX[s].length, 0);
      assert.equal(isTerminalStatus(s), true);
    }
  });

  it("DISPUTED allows ADMIN resolve to COMPLETED or CANCELLED", () => {
    assert.doesNotThrow(() =>
      assertTransitionAllowed(
        "DISPUTED",
        "COMPLETED",
        "ADMIN",
        "DISPUTE_RESOLVED_SELLER_PAYOUT"
      )
    );
    assert.doesNotThrow(() =>
      assertTransitionAllowed(
        "DISPUTED",
        "CANCELLED",
        "ADMIN",
        "DISPUTE_RESOLVED_BUYER_REFUND"
      )
    );
    assert.throws(() =>
      assertTransitionAllowed(
        "DISPUTED",
        "COMPLETED",
        "BUYER",
        "DISPUTE_RESOLVED_SELLER_PAYOUT"
      )
    );
  });

  it("happy-path statuses are non-terminal until COMPLETED", () => {
    for (const s of HAPPY_PATH_STATUSES) {
      if (s === "COMPLETED") assert.equal(isTerminalStatus(s), true);
      else assert.equal(isTerminalStatus(s), false);
    }
  });

  it("DISCUSSION allows OFFER_PENDING and CANCELLED only", () => {
    const targets = [
      ...new Set(TRANSITION_MATRIX.DISCUSSION.map((e) => e.to)),
    ].sort();
    assert.deepEqual(targets, ["CANCELLED", "OFFER_PENDING"]);
  });

  it("DISCUSSION → OFFER_PENDING is buyer-only for OFFER_SUBMITTED", () => {
    assert.doesNotThrow(() =>
      assertTransitionAllowed(
        "DISCUSSION",
        "OFFER_PENDING",
        "BUYER",
        "OFFER_SUBMITTED"
      )
    );
    assert.throws(() =>
      assertTransitionAllowed(
        "DISCUSSION",
        "OFFER_PENDING",
        "SELLER",
        "OFFER_SUBMITTED"
      )
    );
  });

  it("PAID cancel requires REFUND_APPROVED", () => {
    const cancel = TRANSITION_MATRIX.PAID.find((e) => e.to === "CANCELLED");
    assert.ok(cancel);
    assert.deepEqual(cancel!.requiredReasons, ["REFUND_APPROVED"]);
    assert.ok(!cancel!.actors.includes("BUYER"));
  });
});

describe("11A allowed transitions (positive)", () => {
  for (const from of TRANSACTION_STATUSES) {
    for (const edge of TRANSITION_MATRIX[from]) {
      for (const actor of edge.actors) {
        const reason =
          edge.requiredReasons?.[0] ??
          ("SYSTEM_TRANSITION" as ReasonCode);
        it(`allows ${from} -> ${edge.to} as ${actor} (${reason})`, () => {
          assert.doesNotThrow(() =>
            assertTransitionAllowed(from, edge.to, actor, reason)
          );
        });
      }
    }
  }
});

describe("11A illegal jumps (negative)", () => {
  const illegalPairs: Array<[TransactionStatus, TransactionStatus]> = [];
  for (const from of TRANSACTION_STATUSES) {
    for (const to of TRANSACTION_STATUSES) {
      if (from === to) continue;
      const anyActorAllowed = ACTOR_TYPES.some(
        (a) => findTransitionEdge(from, to, a) != null
      );
      if (!anyActorAllowed) illegalPairs.push([from, to]);
    }
  }

  it(`generated ${illegalPairs.length} illegal pairs (>= 80)`, () => {
    assert.ok(illegalPairs.length >= 80, String(illegalPairs.length));
  });

  // Sample all illegal pairs — each is a test case
  for (const [from, to] of illegalPairs) {
    it(`blocks ${from} -> ${to}`, () => {
      assert.throws(
        () =>
          assertTransitionAllowed(
            from,
            to,
            "ADMIN",
            "SYSTEM_TRANSITION"
          ),
        (e: unknown) => e instanceof InvalidTransitionError
      );
    });
  }

  it("blocks DISCUSSION -> PAID", () => {
    assert.throws(
      () =>
        assertTransitionAllowed(
          "DISCUSSION",
          "PAID",
          "SYSTEM",
          "PAYMENT_CONFIRMED"
        ),
      InvalidTransitionError
    );
  });

  it("blocks COMPLETED -> NEGOTIATING", () => {
    assert.throws(
      () =>
        assertTransitionAllowed(
          "COMPLETED",
          "NEGOTIATING",
          "ADMIN",
          "MUTUAL_AGREEMENT"
        ),
      InvalidTransitionError
    );
  });

  it("blocks BUYER PAYMENT_PENDING -> PAID", () => {
    assert.throws(
      () =>
        assertTransitionAllowed(
          "PAYMENT_PENDING",
          "PAID",
          "BUYER",
          "PAYMENT_CONFIRMED"
        ),
      InvalidTransitionError
    );
  });

  it("blocks BUYER PAID -> CANCELLED without refund gate", () => {
    assert.throws(
      () =>
        assertTransitionAllowed(
          "PAID",
          "CANCELLED",
          "BUYER",
          "BUYER_CANCELLED"
        ),
      InvalidTransitionError
    );
  });

  it("blocks ADMIN PAID -> CANCELLED with wrong reason", () => {
    assert.throws(
      () =>
        assertTransitionAllowed(
          "PAID",
          "CANCELLED",
          "ADMIN",
          "ADMIN_CANCELLED"
        ),
      InvalidTransitionError
    );
  });

  it("allows ADMIN PAID -> CANCELLED with REFUND_APPROVED", () => {
    assert.doesNotThrow(() =>
      assertTransitionAllowed(
        "PAID",
        "CANCELLED",
        "ADMIN",
        "REFUND_APPROVED"
      )
    );
  });
});

describe("11A actor role restrictions", () => {
  it("BUYER cannot mark SHIPPED", () => {
    assert.equal(
      listAllowedTargets("SHIPPING_PENDING", "BUYER").includes("SHIPPED"),
      false
    );
  });

  it("SELLER can mark SHIPPED", () => {
    assert.ok(listAllowedTargets("SHIPPING_PENDING", "SELLER").includes("SHIPPED"));
  });

  it("SYSTEM can expire OFFER_PENDING", () => {
    assert.ok(listAllowedTargets("OFFER_PENDING", "SYSTEM").includes("EXPIRED"));
  });

  it("BUYER cannot expire OFFER_PENDING", () => {
    assert.equal(
      listAllowedTargets("OFFER_PENDING", "BUYER").includes("EXPIRED"),
      false
    );
  });
});

describe("11A pure apply happy path", () => {
  it("DISCUSSION → COMPLETED via canonical steps", () => {
    let tx = baseTx("DISCUSSION", 0);
    for (const step of HAPPY_STEPS) {
      tx = applyTransitionPure(tx, step.to, step.actor, step.reason);
    }
    assert.equal(tx.status, "COMPLETED");
    assert.equal(tx.version, HAPPY_STEPS.length);
    assert.equal(tx.stateMachineVersion, "1.0");
  });

  it("rejects self-transition", () => {
    assert.throws(
      () =>
        applyTransitionPure(
          baseTx("DISCUSSION"),
          "DISCUSSION",
          "BUYER",
          "SYSTEM_TRANSITION"
        ),
      InvalidTransitionError
    );
  });
});

describe("11A audit hash chain (pure)", () => {
  it("builds and verifies append-only chain", () => {
    const rows = [];
    let prev: string | null = null;
    const steps = HAPPY_STEPS.slice(0, 4);
    let from: TransactionStatus = "DISCUSSION";
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      const audit = buildAuditRecord({
        transactionId: "tx-1",
        sequenceId: i + 1,
        eventId: `e-${i}`,
        fromStatus: from,
        toStatus: step.to,
        versionAfter: i + 1,
        actorType: step.actor,
        actorId: "actor",
        reasonCode: step.reason,
        previousHash: prev,
      });
      rows.push({
        sequenceId: audit.sequenceId,
        stateHash: audit.stateHash,
        fromStatus: from,
        toStatus: step.to,
        versionAfter: i + 1,
        actorType: step.actor,
        actorId: "actor",
        reasonCode: step.reason,
        transactionId: "tx-1",
      });
      prev = audit.stateHash;
      from = step.to;
    }
    const check = verifyAuditChain(rows);
    assert.equal(check.ok, true);
  });

  it("detects tampered hash", () => {
    const h = computeStateHash({
      transactionId: "tx",
      sequenceId: 1,
      fromStatus: "DISCUSSION",
      toStatus: "CANCELLED",
      version: 1,
      actorType: "BUYER",
      actorId: "b",
      reasonCode: "BUYER_CANCELLED",
      previousHash: null,
    });
    const check = verifyAuditChain([
      {
        sequenceId: 1,
        stateHash: h.slice(0, -4) + "dead",
        fromStatus: "DISCUSSION",
        toStatus: "CANCELLED",
        versionAfter: 1,
        actorType: "BUYER",
        actorId: "b",
        reasonCode: "BUYER_CANCELLED",
        transactionId: "tx",
      },
    ]);
    assert.equal(check.ok, false);
    assert.equal(check.brokenAt, 1);
  });
});
