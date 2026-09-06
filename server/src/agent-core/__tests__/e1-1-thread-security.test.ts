/**
 * E1.1 — thread security hardening tests.
 * Anonymous continuation requires the server-issued token; claim handoff
 * moves ownership to the JWT userId; a claimed thread can never be re-accessed
 * with the old anon token.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { InMemoryThreadStore, mintAnonSessionToken, newThreadRecord } from "../thread-store.js";
import { setThreadStoreForTests } from "../thread-store-instance.js";
import { claimThreadForUser, runThreadTurn } from "../thread-service.js";

afterEach(() => {
  setThreadStoreForTests(null);
});

function installEmptyModel() {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    if (!url.includes("generativelanguage.googleapis.com")) {
      return original(input, init);
    }
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [] } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;
  process.env.GEMINI_API_KEY = "e1.1-test-key";
  return () => {
    globalThis.fetch = original;
    delete process.env.GEMINI_API_KEY;
  };
}

async function expectViolation(promise: Promise<unknown>) {
  await assert.rejects(promise, /thread_ownership_violation/);
}

describe("E1.1 — anonymous thread continuation requires the server token", () => {
  it("anon thread + correct token → continuation PASS", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    const restore = installEmptyModel();
    try {
      const t1 = await runThreadTurn({
        clientMessages: [{ role: "user", text: "Parduodu dviratį" }],
      });
      const token = t1.thread.anonSessionToken!;
      const t2 = await runThreadTurn({
        threadId: t1.thread.threadId,
        anonSessionToken: token,
        clientMessages: [{ role: "user", text: "Naudotas" }],
      });
      assert.equal(t2.thread.threadId, t1.thread.threadId);
      assert.equal(t2.thread.version > t1.thread.version, true);
    } finally {
      restore();
    }
  });

  it("anon thread + missing token → DENY", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    const restore = installEmptyModel();
    try {
      const t1 = await runThreadTurn({
        clientMessages: [{ role: "user", text: "Parduodu dviratį" }],
      });
      await expectViolation(
        runThreadTurn({
          threadId: t1.thread.threadId,
          clientMessages: [{ role: "user", text: "Naudotas" }],
        })
      );
    } finally {
      restore();
    }
  });

  it("anon thread + wrong token → DENY", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    const restore = installEmptyModel();
    try {
      const t1 = await runThreadTurn({
        clientMessages: [{ role: "user", text: "Parduodu dviratį" }],
      });
      await expectViolation(
        runThreadTurn({
          threadId: t1.thread.threadId,
          anonSessionToken: "wrong-token",
          clientMessages: [{ role: "user", text: "Naudotas" }],
        })
      );
    } finally {
      restore();
    }
  });

  it("svetimas threadId be tokeno → DENY", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    const store = new InMemoryThreadStore();
    const owned = newThreadRecord({ ownerUserId: "user-A" });
    await store.create(owned);
    setThreadStoreForTests(store);

    await expectViolation(
      runThreadTurn({
        threadId: owned.threadId,
        clientMessages: [{ role: "user", text: "labas" }],
      })
    );
  });

  it("anon → login → claim → continuation PASS", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    const restore = installEmptyModel();
    try {
      const t1 = await runThreadTurn({
        clientMessages: [{ role: "user", text: "Parduodu dviratį" }],
      });
      const token = t1.thread.anonSessionToken!;
      const claimed = await claimThreadForUser(t1.thread.threadId, "user-1", token);
      assert.equal(claimed.ok, true);

      // Authenticated continuation via JWT userId only (no token needed).
      const t2 = await runThreadTurn({
        threadId: t1.thread.threadId,
        authUserId: "user-1",
        clientMessages: [{ role: "user", text: "Naudotas" }],
      });
      assert.equal(t2.thread.threadId, t1.thread.threadId);
    } finally {
      restore();
    }
  });

  it("po claim senas anon tokenas nebegali suteikti prieigos", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    const restore = installEmptyModel();
    try {
      const t1 = await runThreadTurn({
        clientMessages: [{ role: "user", text: "Parduodu dviratį" }],
      });
      const token = t1.thread.anonSessionToken!;
      const claimed = await claimThreadForUser(t1.thread.threadId, "user-1", token);
      assert.equal(claimed.ok, true);

      // Old anon token must no longer work (the thread is now owned).
      await expectViolation(
        runThreadTurn({
          threadId: t1.thread.threadId,
          anonSessionToken: token,
          clientMessages: [{ role: "user", text: "Kaina 100" }],
        })
      );
      // And a DIFFERENT user cannot continue it either.
      await expectViolation(
        runThreadTurn({
          threadId: t1.thread.threadId,
          authUserId: "user-2",
          clientMessages: [{ role: "user", text: "Kaina 100" }],
        })
      );
    } finally {
      restore();
    }
  });
});
