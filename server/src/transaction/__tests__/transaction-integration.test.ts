/**
 * Stage 11A — PostgreSQL (PGlite) integration:
 * optimistic locking race, idempotency, audit append-only, full happy path.
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  IdempotencyConflictError,
  InvalidTransitionError,
  TRANSACTION_MIGRATION_SQL,
  TRANSACTION_STATE_MACHINE_VERSION,
  TransactionRepository,
  VersionConflictError,
  verifyAuditChain,
  type ActorType,
  type ReasonCode,
  type TransactionStatus,
  type TxQueryable,
} from "../index.js";

function adaptPglite(db: PGlite): TxQueryable {
  return {
    async query(text, params = []) {
      const res = await db.query(text, params as never[]);
      return {
        rows: (res.rows ?? []) as never[],
        rowCount: res.affectedRows ?? null,
      };
    },
  };
}

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

describe("11A Transaction PostgreSQL integration", () => {
  let db: PGlite;
  let repo: TransactionRepository;

  before(async () => {
    db = new PGlite();
    await db.exec(TRANSACTION_MIGRATION_SQL);
    repo = new TransactionRepository(adaptPglite(db));
  });

  after(async () => {
    await db?.close();
  });

  it("creates transaction in DISCUSSION with version 0 and SM 1.0", async () => {
    const tx = await repo.create({
      listingId: "L-create",
      buyerId: "b1",
      sellerId: "s1",
      currentPrice: 250,
      idempotencyKey: "create-idem-0001",
    });
    assert.equal(tx.status, "DISCUSSION");
    assert.equal(tx.version, 0);
    assert.equal(tx.stateMachineVersion, TRANSACTION_STATE_MACHINE_VERSION);
    const again = await repo.create({
      listingId: "L-other",
      buyerId: "b1",
      sellerId: "s1",
      idempotencyKey: "create-idem-0001",
    });
    assert.equal(again.id, tx.id);
  });

  it("happy path DISCUSSION → COMPLETED with events + audit", async () => {
    const tx0 = await repo.create({
      listingId: "L-happy",
      buyerId: "buyer-h",
      sellerId: "seller-h",
      currentPrice: 999,
    });
    let version = tx0.version;
    let id = tx0.id;
    for (let i = 0; i < HAPPY_STEPS.length; i++) {
      const step = HAPPY_STEPS[i]!;
      const res = await repo.executeTransition({
        transactionId: id,
        expectedVersion: version,
        toStatus: step.to,
        actorType: step.actor,
        actorId: step.actor === "SYSTEM" ? "system" : step.actor.toLowerCase(),
        idempotencyKey: `happy-${id}-${i}`,
        reasonCode: step.reason,
      });
      assert.equal(res.idempotentReplay, false);
      assert.equal(res.transaction.status, step.to);
      assert.equal(res.transaction.version, version + 1);
      version = res.transaction.version;
    }
    const final = await repo.getById(id);
    assert.equal(final!.status, "COMPLETED");
    const events = await repo.listEvents(id);
    assert.equal(events.length, HAPPY_STEPS.length);
    const audit = await repo.listAudit(id);
    assert.equal(audit.length, HAPPY_STEPS.length);
    // Rebuild chain verification using event payloads
    const chainRows = [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;
      const a = audit[i]!;
      chainRows.push({
        sequenceId: a.sequenceId,
        stateHash: a.stateHash,
        fromStatus: ev.fromStatus,
        toStatus: ev.toStatus,
        versionAfter: i + 1,
        actorType: ev.actorType,
        actorId: ev.actorId,
        reasonCode: String(ev.payloadJson.reasonCode) as ReasonCode,
        transactionId: id,
      });
    }
    assert.equal(verifyAuditChain(chainRows).ok, true);
  });

  it("rejects illegal DISCUSSION → PAID in DB path", async () => {
    const tx = await repo.create({
      listingId: "L-illegal",
      buyerId: "b-il",
      sellerId: "s-il",
    });
    await assert.rejects(
      () =>
        repo.executeTransition({
          transactionId: tx.id,
          expectedVersion: 0,
          toStatus: "PAID",
          actorType: "SYSTEM",
          actorId: "sys",
          idempotencyKey: "illegal-jump-0001",
          reasonCode: "PAYMENT_CONFIRMED",
        }),
      InvalidTransitionError
    );
    const still = await repo.getById(tx.id);
    assert.equal(still!.status, "DISCUSSION");
    assert.equal(still!.version, 0);
    assert.equal((await repo.listEvents(tx.id)).length, 0);
  });

  it("optimistic locking race: 10 concurrent same-version → exactly 1 win", async () => {
    const tx = await repo.create({
      listingId: "L-race",
      buyerId: "b-race",
      sellerId: "s-race",
    });
    // First move to OFFER_PENDING so we race on CANCELLED from there? 
    // Race on DISCUSSION -> OFFER_PENDING with same expectedVersion 0.
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        repo.executeTransition({
          transactionId: tx.id,
          expectedVersion: 0,
          toStatus: "OFFER_PENDING",
          actorType: "BUYER",
          actorId: "b-race",
          idempotencyKey: `race-key-${tx.id}-${i}`,
          reasonCode: "OFFER_SUBMITTED",
        })
      )
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, `wins=${fulfilled.length}`);
    assert.equal(rejected.length, 9);
    for (const r of rejected) {
      assert.ok(
        r.status === "rejected" && r.reason instanceof VersionConflictError,
        String(r.status === "rejected" ? r.reason : "")
      );
    }
    const after = await repo.getById(tx.id);
    assert.equal(after!.status, "OFFER_PENDING");
    assert.equal(after!.version, 1);
    assert.equal((await repo.listEvents(tx.id)).length, 1);
    assert.equal((await repo.listAudit(tx.id)).length, 1);
  });

  it("idempotency: same key returns replay without duplicate events", async () => {
    const tx = await repo.create({
      listingId: "L-idem",
      buyerId: "b-idem",
      sellerId: "s-idem",
    });
    const cmd = {
      transactionId: tx.id,
      expectedVersion: 0,
      toStatus: "CANCELLED" as const,
      actorType: "BUYER" as const,
      actorId: "b-idem",
      idempotencyKey: `idem-stable-${tx.id}`,
      reasonCode: "BUYER_CANCELLED" as const,
    };
    const first = await repo.executeTransition(cmd);
    assert.equal(first.idempotentReplay, false);
    const second = await repo.executeTransition(cmd);
    assert.equal(second.idempotentReplay, true);
    assert.equal(second.eventId, first.eventId);
    assert.equal((await repo.listEvents(tx.id)).length, 1);
    assert.equal((await repo.listAudit(tx.id)).length, 1);
    const after = await repo.getById(tx.id);
    assert.equal(after!.status, "CANCELLED");
    assert.equal(after!.version, 1);
  });

  it("idempotency conflict when same key used for different payload", async () => {
    const tx = await repo.create({
      listingId: "L-idem2",
      buyerId: "b-i2",
      sellerId: "s-i2",
    });
    await repo.executeTransition({
      transactionId: tx.id,
      expectedVersion: 0,
      toStatus: "OFFER_PENDING",
      actorType: "BUYER",
      actorId: "b-i2",
      idempotencyKey: `idem-conflict-${tx.id}`,
      reasonCode: "OFFER_SUBMITTED",
    });
    await assert.rejects(
      () =>
        repo.executeTransition({
          transactionId: tx.id,
          expectedVersion: 0,
          toStatus: "CANCELLED",
          actorType: "BUYER",
          actorId: "b-i2",
          idempotencyKey: `idem-conflict-${tx.id}`,
          reasonCode: "BUYER_CANCELLED",
        }),
      IdempotencyConflictError
    );
  });

  it("stale expectedVersion yields 409 VersionConflictError", async () => {
    const tx = await repo.create({
      listingId: "L-stale",
      buyerId: "b-st",
      sellerId: "s-st",
    });
    await repo.executeTransition({
      transactionId: tx.id,
      expectedVersion: 0,
      toStatus: "OFFER_PENDING",
      actorType: "BUYER",
      actorId: "b-st",
      idempotencyKey: `stale-a-${tx.id}`,
      reasonCode: "OFFER_SUBMITTED",
    });
    await assert.rejects(
      () =>
        repo.executeTransition({
          transactionId: tx.id,
          expectedVersion: 0,
          toStatus: "CANCELLED",
          actorType: "SELLER",
          actorId: "s-st",
          idempotencyKey: `stale-b-${tx.id}`,
          reasonCode: "SELLER_CANCELLED",
        }),
      VersionConflictError
    );
  });

  it("PAID → CANCELLED only with REFUND_APPROVED (ADMIN)", async () => {
    const tx = await repo.create({
      listingId: "L-refund",
      buyerId: "b-rf",
      sellerId: "s-rf",
      currentPrice: 50,
    });
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const step = HAPPY_STEPS[i]!;
      const res = await repo.executeTransition({
        transactionId: tx.id,
        expectedVersion: v,
        toStatus: step.to,
        actorType: step.actor,
        actorId: "actor",
        idempotencyKey: `rf-${tx.id}-${i}`,
        reasonCode: step.reason,
      });
      v = res.transaction.version;
    }
    assert.equal((await repo.getById(tx.id))!.status, "PAID");
    await assert.rejects(
      () =>
        repo.executeTransition({
          transactionId: tx.id,
          expectedVersion: v,
          toStatus: "CANCELLED",
          actorType: "ADMIN",
          actorId: "admin",
          idempotencyKey: `rf-bad-${tx.id}`,
          reasonCode: "ADMIN_CANCELLED",
        }),
      InvalidTransitionError
    );
    const ok = await repo.executeTransition({
      transactionId: tx.id,
      expectedVersion: v,
      toStatus: "CANCELLED",
      actorType: "ADMIN",
      actorId: "admin",
      idempotencyKey: `rf-ok-${tx.id}`,
      reasonCode: "REFUND_APPROVED",
    });
    assert.equal(ok.transaction.status, "CANCELLED");
  });

  it("COMPLETED is terminal — no further transitions", async () => {
    const tx = await repo.create({
      listingId: "L-term",
      buyerId: "b-tm",
      sellerId: "s-tm",
    });
    let v = 0;
    for (let i = 0; i < HAPPY_STEPS.length; i++) {
      const step = HAPPY_STEPS[i]!;
      const res = await repo.executeTransition({
        transactionId: tx.id,
        expectedVersion: v,
        toStatus: step.to,
        actorType: step.actor,
        actorId: "a",
        idempotencyKey: `term-${tx.id}-${i}`,
        reasonCode: step.reason,
      });
      v = res.transaction.version;
    }
    await assert.rejects(
      () =>
        repo.executeTransition({
          transactionId: tx.id,
          expectedVersion: v,
          toStatus: "DISPUTED",
          actorType: "BUYER",
          actorId: "b-tm",
          idempotencyKey: `term-fail-${tx.id}`,
          reasonCode: "DISPUTE_OPENED",
        }),
      InvalidTransitionError
    );
  });

  // Extra integration cases to harden coverage (cancel / expire / dispute paths)
  const earlyCancelFrom: TransactionStatus[] = [
    "DISCUSSION",
    "OFFER_PENDING",
    "NEGOTIATING",
    "AGREED",
    "PAYMENT_PENDING",
  ];

  for (const target of earlyCancelFrom) {
    it(`can reach ${target} then CANCELLED by BUYER/ADMIN path`, async () => {
      const tx = await repo.create({
        listingId: `L-c-${target}`,
        buyerId: `b-${target}`,
        sellerId: `s-${target}`,
      });
      let v = 0;
      const idx = HAPPY_STEPS.findIndex((s) => s.to === target);
      const upto = target === "DISCUSSION" ? -1 : idx;
      for (let i = 0; i <= upto; i++) {
        const step = HAPPY_STEPS[i]!;
        const res = await repo.executeTransition({
          transactionId: tx.id,
          expectedVersion: v,
          toStatus: step.to,
          actorType: step.actor,
          actorId: "a",
          idempotencyKey: `ec-${tx.id}-${i}`,
          reasonCode: step.reason,
        });
        v = res.transaction.version;
      }
      const res = await repo.executeTransition({
        transactionId: tx.id,
        expectedVersion: v,
        toStatus: "CANCELLED",
        actorType: "BUYER",
        actorId: `b-${target}`,
        idempotencyKey: `ec-cancel-${tx.id}`,
        reasonCode: "BUYER_CANCELLED",
      });
      assert.equal(res.transaction.status, "CANCELLED");
    });
  }

  it("SYSTEM can EXPIRE from OFFER_PENDING", async () => {
    const tx = await repo.create({
      listingId: "L-exp",
      buyerId: "b-ex",
      sellerId: "s-ex",
    });
    await repo.executeTransition({
      transactionId: tx.id,
      expectedVersion: 0,
      toStatus: "OFFER_PENDING",
      actorType: "BUYER",
      actorId: "b-ex",
      idempotencyKey: `exp-1-${tx.id}`,
      reasonCode: "OFFER_SUBMITTED",
    });
    const res = await repo.executeTransition({
      transactionId: tx.id,
      expectedVersion: 1,
      toStatus: "EXPIRED",
      actorType: "SYSTEM",
      actorId: "system",
      idempotencyKey: `exp-2-${tx.id}`,
      reasonCode: "TIMEOUT_EXPIRED",
    });
    assert.equal(res.transaction.status, "EXPIRED");
  });

  it("DISPUTED from SHIPPED by BUYER", async () => {
    const tx = await repo.create({
      listingId: "L-disp",
      buyerId: "b-dp",
      sellerId: "s-dp",
    });
    let v = 0;
    for (let i = 0; i < 7; i++) {
      const step = HAPPY_STEPS[i]!;
      const res = await repo.executeTransition({
        transactionId: tx.id,
        expectedVersion: v,
        toStatus: step.to,
        actorType: step.actor,
        actorId: "a",
        idempotencyKey: `dp-${tx.id}-${i}`,
        reasonCode: step.reason,
      });
      v = res.transaction.version;
    }
    assert.equal((await repo.getById(tx.id))!.status, "SHIPPED");
    const res = await repo.executeTransition({
      transactionId: tx.id,
      expectedVersion: v,
      toStatus: "DISPUTED",
      actorType: "BUYER",
      actorId: "b-dp",
      idempotencyKey: `dp-open-${tx.id}`,
      reasonCode: "DISPUTE_OPENED",
    });
    assert.equal(res.transaction.status, "DISPUTED");
  });
});
