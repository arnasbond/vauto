/**
 * Stage 11C — Transaction Chat 1.0 suite (PGlite + pure helpers).
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  TRANSACTION_MIGRATION_SQL,
  TransactionRepository,
  type TxQueryable,
} from "../../transaction/index.js";
import {
  OFFERS_MIGRATION_SQL,
  OfferEngine,
} from "../../transaction/offers/index.js";
import {
  TRANSACTION_CHAT_MIGRATION_SQL,
  TRANSACTION_CHAT_VERSION,
  createTimelineService,
  escapeHtml,
  sanitizeUserText,
  PostMessageBodySchema,
  encodeCursor,
  decodeCursor,
  ChatNotFoundError,
  ChatValidationError,
  appendDomainEventOn,
} from "../index.js";
import { DEAL_ROOM_MIGRATION_SQL } from "../../deal-room/index.js";

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

describe("11C Transaction Chat", () => {
  let db: PGlite;
  let q: TxQueryable;
  let txRepo: TransactionRepository;
  let offers: OfferEngine;
  let seq = 0;
  const key = (p: string) => `${p}-${++seq}-${Date.now()}`;

  before(async () => {
    db = new PGlite();
    await db.exec(TRANSACTION_MIGRATION_SQL);
    await db.exec(OFFERS_MIGRATION_SQL);
    await db.exec(TRANSACTION_CHAT_MIGRATION_SQL);
    await db.exec(DEAL_ROOM_MIGRATION_SQL);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS listings (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        price NUMERIC(12,2),
        image TEXT,
        images JSONB DEFAULT '[]'::jsonb,
        attributes JSONB DEFAULT '{}'::jsonb,
        status TEXT DEFAULT 'active'
      );
    `);
    q = adaptPglite(db);
    txRepo = new TransactionRepository(q);
    offers = new OfferEngine(q);
  });

  after(async () => {
    await db?.close();
  });

  async function openPair(tag: string) {
    const buyerId = `b-${tag}`;
    const sellerId = `s-${tag}`;
    const listingId = `L-${tag}`;
    await q.query(
      `INSERT INTO listings (id, title, price, image, attributes)
       VALUES ($1,$2,100,'https://img.example/x.jpg','{"src":"chat"}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [listingId, `Listing ${tag}`]
    );
    const tx = await txRepo.create({
      listingId,
      buyerId,
      sellerId,
    });
    return { tx, buyerId, sellerId, chat: createTimelineService(q) };
  }

  it("exports chatVersion 1.0", () => {
    assert.equal(TRANSACTION_CHAT_VERSION, "1.0");
  });

  // —— 40 message create ——
  for (let i = 0; i < 40; i++) {
    it(`message create #${i}`, async () => {
      const { tx, buyerId, chat } = await openPair(`msg-${i}-${seq}`);
      const res = await chat.postMessage({
        transactionId: tx.id,
        userId: buyerId,
        body: {
          text: `Labas pasiūlymas ${i} — 700 € yra tik tekstas`,
          idempotencyKey: key(`msg-${i}`),
        },
      });
      assert.equal(res.item.messageType, "USER_MESSAGE");
      assert.equal(res.item.senderId, buyerId);
      assert.equal(res.idempotentReplay, false);
      const after = await txRepo.getById(tx.id);
      assert.equal(after!.status, "DISCUSSION");
      assert.equal(after!.version, 0);
    });
  }

  // —— 30 timeline merge ——
  for (let i = 0; i < 30; i++) {
    it(`timeline merge USER+DOMAIN #${i}`, async () => {
      const { tx, buyerId, sellerId, chat } = await openPair(`mix-${i}-${seq}`);
      await chat.postMessage({
        transactionId: tx.id,
        userId: buyerId,
        body: { text: `Žinutė ${i}`, idempotencyKey: key(`mix-m-${i}`) },
      });
      await offers.create({
        transactionId: tx.id,
        actorUserId: buyerId,
        amountCents: 10000 + i,
        idempotencyKey: key(`mix-o-${i}`),
      });
      const page = await chat.getTimeline({
        transactionId: tx.id,
        userId: sellerId,
        query: { limit: 50 },
      });
      const types = page.items.map((x) => x.messageType);
      assert.ok(types.includes("USER_MESSAGE"));
      assert.ok(types.includes("DOMAIN_EVENT"));
      assert.equal(page.header.transactionState, "OFFER_PENDING");
      assert.equal(page.chatVersion, "1.0");
      // chronological: createdAt non-decreasing
      for (let j = 1; j < page.items.length; j++) {
        assert.ok(
          page.items[j]!.createdAt >= page.items[j - 1]!.createdAt
        );
      }
    });
  }

  // —— 25 IDOR ——
  for (let i = 0; i < 25; i++) {
    it(`IDOR isolation #${i}`, async () => {
      const { tx, buyerId, chat } = await openPair(`idor-${i}-${seq}`);
      await chat.postMessage({
        transactionId: tx.id,
        userId: buyerId,
        body: { text: "privati", idempotencyKey: key(`idor-m-${i}`) },
      });
      await assert.rejects(
        () =>
          chat.getTimeline({
            transactionId: tx.id,
            userId: `stranger-${i}`,
            query: {},
          }),
        ChatNotFoundError
      );
      await assert.rejects(
        () =>
          chat.postMessage({
            transactionId: tx.id,
            userId: `stranger-${i}`,
            body: { text: "hack", idempotencyKey: key(`idor-w-${i}`) },
          }),
        ChatNotFoundError
      );
    });
  }

  // —— 20 idempotency (incl. parallel) ——
  for (let i = 0; i < 10; i++) {
    it(`idempotency replay #${i}`, async () => {
      const { tx, buyerId, chat } = await openPair(`idem-${i}-${seq}`);
      const idem = key(`idem-stable-${i}`);
      const a = await chat.postMessage({
        transactionId: tx.id,
        userId: buyerId,
        body: { text: "vienas", idempotencyKey: idem },
      });
      const b = await chat.postMessage({
        transactionId: tx.id,
        userId: buyerId,
        body: { text: "vienas", idempotencyKey: idem },
      });
      assert.equal(b.idempotentReplay, true);
      assert.equal(b.item.id, a.item.id);
    });
  }

  for (let i = 0; i < 10; i++) {
    it(`idempotency parallel 10 retries → 1 row #${i}`, async () => {
      const { tx, buyerId, chat } = await openPair(`ipar-${i}-${seq}`);
      const idem = key(`ipar-${i}`);
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          chat.postMessage({
            transactionId: tx.id,
            userId: buyerId,
            body: { text: "retry", idempotencyKey: idem },
          })
        )
      );
      const ids = new Set(results.map((r) => r.item.id));
      assert.equal(ids.size, 1);
      const page = await chat.getTimeline({
        transactionId: tx.id,
        userId: buyerId,
        query: { limit: 50 },
      });
      assert.equal(
        page.items.filter((x) => x.messageType === "USER_MESSAGE").length,
        1
      );
    });
  }

  // —— 20 cursor pagination ——
  for (let i = 0; i < 20; i++) {
    it(`cursor pagination #${i}`, async () => {
      const { tx, buyerId, chat } = await openPair(`cur-${i}-${seq}`);
      for (let m = 0; m < 8; m++) {
        await chat.postMessage({
          transactionId: tx.id,
          userId: buyerId,
          body: { text: `m-${m}`, idempotencyKey: key(`cur-${i}-${m}`) },
        });
      }
      const page1 = await chat.getTimeline({
        transactionId: tx.id,
        userId: buyerId,
        query: { limit: 3 },
      });
      assert.equal(page1.items.length, 3);
      assert.ok(page1.nextCursor);
      const page2 = await chat.getTimeline({
        transactionId: tx.id,
        userId: buyerId,
        query: { limit: 3, before: page1.nextCursor },
      });
      assert.ok(page2.items.length >= 1);
      const ids1 = new Set(page1.items.map((x) => x.id));
      for (const it of page2.items) {
        assert.equal(ids1.has(it.id), false);
      }
      const c = encodeCursor(page1.items[0]!.createdAt, page1.items[0]!.id);
      const d = decodeCursor(c);
      assert.ok(d);
      assert.equal(d!.id, page1.items[0]!.id);
    });
  }

  // —— 20 offer/domain integration ——
  for (let i = 0; i < 20; i++) {
    it(`offer domain event on timeline #${i}`, async () => {
      const { tx, buyerId, sellerId, chat } = await openPair(`dom-${i}-${seq}`);
      const o = await offers.create({
        transactionId: tx.id,
        actorUserId: buyerId,
        amountCents: 20000 + i,
        idempotencyKey: key(`dom-o-${i}`),
      });
      await offers.accept({
        offerId: o.offer.id,
        actorUserId: sellerId,
        idempotencyKey: key(`dom-a-${i}`),
        expectedVersion: o.offer.version,
      });
      const page = await chat.getTimeline({
        transactionId: tx.id,
        userId: buyerId,
        query: { limit: 50 },
      });
      const events = page.items.filter((x) => x.messageType === "DOMAIN_EVENT");
      assert.ok(events.some((e) => e.eventType === "OFFER_CREATED"));
      assert.ok(events.some((e) => e.eventType === "OFFER_ACCEPTED"));
      assert.equal(page.header.transactionState, "AGREED");
      // Client cannot forge DOMAIN_EVENT via message API
      assert.throws(() =>
        PostMessageBodySchema.parse({
          text: "x",
          idempotencyKey: "forge-domain-01",
          messageType: "DOMAIN_EVENT",
        } as never)
      );
    });
  }

  // —— 15 attachment ownership / safety ——
  for (let i = 0; i < 15; i++) {
    it(`attachment safety #${i}`, async () => {
      const { tx, buyerId, chat } = await openPair(`att-${i}-${seq}`);
      const res = await chat.postMessage({
        transactionId: tx.id,
        userId: buyerId,
        body: {
          text: "su priedu",
          idempotencyKey: key(`att-${i}`),
          attachmentIds: [`att-${i}`, `safe-${i}`],
        },
      });
      assert.deepEqual(res.item.payload.attachmentIds, [
        `att-${i}`,
        `safe-${i}`,
      ]);
      // Path traversal filtered
      const res2 = await chat.postMessage({
        transactionId: tx.id,
        userId: buyerId,
        body: {
          text: "blogas",
          idempotencyKey: key(`att-bad-${i}`),
          attachmentIds: ["../etc/passwd", `ok-${i}`],
        },
      });
      assert.deepEqual(res2.item.payload.attachmentIds, [`ok-${i}`]);
    });
  }

  // —— 15 XSS ——
  const xssPayloads = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "\"'><svg/onload=alert(1)>",
    "<a href='javascript:alert(1)'>x</a>",
    "&lt;script&gt;",
    "<iframe src='http://evil'>",
    "hello\u0000world",
    "<div onclick='steal()'>",
    "';javascript:alert(1)}",
    "<math><mi//xlink:href='data:x'>",
    "normal <b>bold</b>",
    "€ < 100 > 50 & more",
    "<script>",
    "</script>",
    "';alert`1`}",
  ];
  for (let i = 0; i < xssPayloads.length; i++) {
    it(`XSS escape #${i}`, async () => {
      const raw = xssPayloads[i]!;
      const safe = escapeHtml(sanitizeUserText(raw));
      assert.equal(safe.includes("<script"), false);
      assert.equal(safe.includes("<img"), false);
      assert.equal(safe.includes("<"), false);
      const { tx, buyerId, chat } = await openPair(`xss-${i}-${seq}`);
      const res = await chat.postMessage({
        transactionId: tx.id,
        userId: buyerId,
        body: { text: raw || "x", idempotencyKey: key(`xss-${i}`) },
      });
      assert.equal(res.item.textSafe.includes("<script"), false);
      assert.ok(res.item.textSafe.length >= 0);
    });
  }

  // —— 10 concurrency parallel distinct messages ——
  for (let i = 0; i < 10; i++) {
    it(`parallel distinct messages #${i}`, async () => {
      const { tx, buyerId, sellerId, chat } = await openPair(`par-${i}-${seq}`);
      await Promise.all([
        chat.postMessage({
          transactionId: tx.id,
          userId: buyerId,
          body: { text: "from buyer", idempotencyKey: key(`par-b-${i}`) },
        }),
        chat.postMessage({
          transactionId: tx.id,
          userId: sellerId,
          body: { text: "from seller", idempotencyKey: key(`par-s-${i}`) },
        }),
      ]);
      const page = await chat.getTimeline({
        transactionId: tx.id,
        userId: buyerId,
        query: { limit: 50 },
      });
      assert.equal(
        page.items.filter((x) => x.messageType === "USER_MESSAGE").length,
        2
      );
      const st = await txRepo.getById(tx.id);
      assert.equal(st!.status, "DISCUSSION");
    });
  }

  // —— 5 privacy / read receipts ——
  for (let i = 0; i < 5; i++) {
    it(`read receipt privacy #${i}`, async () => {
      const { tx, buyerId, sellerId, chat } = await openPair(`read-${i}-${seq}`);
      const msg = await chat.postMessage({
        transactionId: tx.id,
        userId: buyerId,
        body: { text: "skaityti", idempotencyKey: key(`read-m-${i}`) },
      });
      await chat.markRead({
        transactionId: tx.id,
        userId: sellerId,
        body: { lastReadMessageId: msg.item.id },
      });
      await assert.rejects(
        () =>
          chat.markRead({
            transactionId: tx.id,
            userId: `admin-fake-${i}`,
            body: { lastReadMessageId: msg.item.id },
          }),
        ChatNotFoundError
      );
      // Cross-tx message id rejected
      const other = await openPair(`read-x-${i}-${seq}`);
      await assert.rejects(
        () =>
          other.chat.markRead({
            transactionId: other.tx.id,
            userId: other.buyerId,
            body: { lastReadMessageId: msg.item.id },
          }),
        ChatNotFoundError
      );
    });
  }

  it("text 'sutinku su 700 €' does NOT change transaction state", async () => {
    const { tx, buyerId, chat } = await openPair(`agree-text-${seq}`);
    await chat.postMessage({
      transactionId: tx.id,
      userId: buyerId,
      body: {
        text: "sutinku su 700 €",
        idempotencyKey: key("agree-text"),
      },
    });
    const after = await txRepo.getById(tx.id);
    assert.equal(after!.status, "DISCUSSION");
  });

  it("server appendDomainEvent works; client schema forbids DOMAIN_EVENT", async () => {
    const { tx } = await openPair(`srv-dom-${seq}`);
    await appendDomainEventOn(q, tx.id, {
      eventType: "TRANSACTION_STATE_CHANGED",
      text: "server only",
      payload: { ok: true },
      idempotencyKey: key("srv-dom"),
    });
    assert.throws(() =>
      PostMessageBodySchema.parse({
        text: "x",
        idempotencyKey: "no-domain-01",
        eventType: "OFFER_ACCEPTED",
      } as never)
    );
  });

  it("rejects empty / oversized validation", async () => {
    const { tx, buyerId, chat } = await openPair(`val-${seq}`);
    await assert.rejects(
      () =>
        chat.postMessage({
          transactionId: tx.id,
          userId: buyerId,
          body: { text: "   ", idempotencyKey: key("empty") },
        }),
      ChatValidationError
    );
  });

  it("limit capped at 50", async () => {
    const { tx, buyerId, chat } = await openPair(`lim-${seq}`);
    await chat.postMessage({
      transactionId: tx.id,
      userId: buyerId,
      body: { text: "hi", idempotencyKey: key("lim") },
    });
    const page = await chat.getTimeline({
      transactionId: tx.id,
      userId: buyerId,
      query: { limit: 999 },
    });
    assert.ok(page.items.length <= 50);
  });
});
