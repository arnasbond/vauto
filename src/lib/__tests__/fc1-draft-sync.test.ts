/**
 * FC-1 — client → canonical server draft-sync integration (frontend).
 *
 * Exercises the REAL client path (syncAgentListingDraft → apiSyncListingDraft →
 * dataFetch → fetch) against a scripted HTTP layer, proving:
 *   - a successful delta sync returns the canonical draft + refreshes the
 *     client thread-link version;
 *   - a stale 409 conflict does NOT overwrite newer state and is surfaced as
 *     stale_version (truthful, recoverable).
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

import {
  buildEnrichmentSyncDelta,
  buildSyncDelta,
  hasSyncableDelta,
  reDiscoverAgentDraft,
  syncAgentListingDraft,
} from "@/lib/agent-draft-sync";
import {
  readAgentThreadLink,
  persistAgentThreadLink,
} from "@/lib/agent-thread-link";
import { enrichVehicleListingDraft } from "@/lib/vehicle-attribute-extract";
import { enrichClothingListingDraft } from "@/lib/clothing-catalog";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
}

let storage: MemoryStorage;

function scriptFetch(script: (url: string, init?: RequestInit) => Response) {
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/vauto-agent/draft/sync")) {
      return script(url, init);
    }
    return new Response(JSON.stringify({ ok: false }), { status: 404 });
  }) as typeof fetch;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://test-api";
  storage = new MemoryStorage();
  (globalThis as unknown as { window?: unknown }).window = { localStorage: storage };
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
  delete (globalThis as unknown as { fetch?: unknown }).fetch;
});

describe("FC-1 — client draft-sync integration", () => {
  it("successful sync returns canonical draft and refreshes thread-link version", async () => {
    persistAgentThreadLink({ threadId: "thr-1", version: 1 });
    scriptFetch((_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      assert.equal(body.threadId, "thr-1");
      assert.equal(body.expectedVersion, 1);
      assert.deepEqual(body.delta, { attributes: { material: "ąžuolas" } });
      return new Response(
        JSON.stringify({
          ok: true,
          draft: { title: "Medinis stalas", attributes: { material: "ąžuolas" } },
          version: 2,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const result = await syncAgentListingDraft({
      delta: { attributes: { material: "ąžuolas" } },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.version, 2);
      assert.equal(
        (result.draft.attributes as Record<string, string>).material,
        "ąžuolas"
      );
    }
    // Client mirror version refreshed from the canonical response.
    assert.equal(readAgentThreadLink()?.version, 2);
  });

  it("stale 409 does not overwrite and surfaces stale_version truthfully", async () => {
    persistAgentThreadLink({ threadId: "thr-1", version: 1 });
    scriptFetch(() => {
      return new Response(JSON.stringify({ ok: false, code: "stale_version" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    });

    const result = await syncAgentListingDraft({
      delta: { price: 1 },
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "stale_version");
    // Client must NOT claim success or advance its version on conflict.
    assert.equal(readAgentThreadLink()?.version, 1);
  });
});

describe("FC-1 — consumer delta builder (the handler's sync path)", () => {
  it("builds the minimal structured delta from a manual-edit patch", () => {
    const delta = buildSyncDelta({
      title: "Medinis stalas",
      price: 450,
      editedByUser: { price: true },
      listingFlowState: "DRAFT_READY",
      attributes: {
        material: "ąžuolas",
        editedByUser: "price|material",
        confirmationToken: "server-owned-token",
        clientDraftId: "local-id",
      },
    });
    assert.equal(delta.title, "Medinis stalas");
    assert.equal(delta.price, 450);
    assert.equal(delta.listingFlowState, undefined, "flow state is server-owned");
    const attrs = (delta.attributes ?? {}) as Record<string, unknown>;
    assert.equal(attrs.material, "ąžuolas", "structured fact kept");
    assert.equal(attrs.editedByUser, undefined, "client metadata excluded");
    assert.equal(attrs.confirmationToken, undefined, "provenance excluded");
    assert.equal(attrs.clientDraftId, undefined, "local id excluded");
  });

  it("handler-equivalent flow sends the minimal delta and accepts the canonical version", async () => {
    persistAgentThreadLink({ threadId: "thr-1", version: 1 });
    const patch = { price: 450, editedByUser: { price: true } };
    let sentBody: Record<string, unknown> = {};
    scriptFetch((_url, init) => {
      sentBody = JSON.parse(String(init?.body ?? "{}"));
      return new Response(
        JSON.stringify({ ok: true, draft: { price: 450 }, version: 2 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const result = await syncAgentListingDraft({ delta: buildSyncDelta(patch) });

    assert.equal(result.ok, true);
    assert.equal((sentBody as { expectedVersion?: number }).expectedVersion, 1);
    assert.equal((sentBody as { delta?: Record<string, unknown> }).delta?.price, 450);
    assert.equal(
      (sentBody as { delta?: Record<string, unknown> }).delta?.editedByUser,
      undefined,
      "metadata must not reach the canonical draft"
    );
    assert.equal(readAgentThreadLink()?.version, 2);
  });
});

/**
 * Mirrors the EXACT enrichment sequence used by the real consumer
 * (SellerFlowContext.applyAgentListingDraft): vehicle enrichment, then clothing
 * enrichment, over the incoming server-derived draft. This is not a
 * "handler-equivalent" fake — it runs the production enrichment functions and
 * feeds their output through the real delta builder + sync.
 */
function runEnrichmentConsumer(serverDraft: {
  title?: string;
  description?: string;
  category?: string;
  attributes?: Record<string, string | string[] | undefined>;
}): { enriched: Record<string, unknown>; delta: Record<string, unknown> } {
  const sourceText = [serverDraft.title, serverDraft.description]
    .filter(Boolean)
    .join(" ");
  let enriched = enrichVehicleListingDraft(serverDraft, [sourceText]);
  enriched = enrichClothingListingDraft(enriched, sourceText);
  const delta = buildEnrichmentSyncDelta(
    serverDraft as unknown as Record<string, unknown>,
    enriched as unknown as Record<string, unknown>
  );
  return {
    enriched: enriched as unknown as Record<string, unknown>,
    delta,
  };
}

type DraftState = { draft: Record<string, unknown>; version: number };

/** In-memory canonical server: applies deltas (shallow attribute merge, mirroring
 *  server mergeDraftDelta), enforces OCC, and serves GET /draft discovery. */
function installDraftServer(initial: DraftState): {
  getCanonical: () => DraftState;
  urls: string[];
} {
  const canonical: DraftState = { ...initial, draft: { ...initial.draft } };
  const urls: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/api/vauto-agent/draft/sync")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        expectedVersion?: number;
        delta?: Record<string, unknown>;
      };
      if (
        body.expectedVersion != null &&
        body.expectedVersion !== canonical.version
      ) {
        return new Response(JSON.stringify({ ok: false, code: "stale_version" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }
      const merged: Record<string, unknown> = { ...canonical.draft };
      for (const [k, v] of Object.entries(body.delta ?? {})) {
        if (k === "attributes" && v && typeof v === "object" && !Array.isArray(v)) {
          merged.attributes = {
            ...((merged.attributes as Record<string, unknown>) ?? {}),
            ...(v as Record<string, unknown>),
          };
        } else {
          merged[k] = v;
        }
      }
      canonical.draft = merged;
      canonical.version += 1;
      return new Response(
        JSON.stringify({ ok: true, draft: canonical.draft, version: canonical.version }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/api/vauto-agent/draft")) {
      return new Response(
        JSON.stringify({
          drafts: [
            { threadId: "thr-1", draft: canonical.draft, version: canonical.version },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ ok: false }), { status: 404 });
  }) as typeof fetch;
  return { getCanonical: () => canonical, urls };
}

describe("FC-1 — enrichment consumer (actual applyAgentListingDraft path)", () => {
  it("clothing enrichment produces a canonical minimal delta", () => {
    const serverDraft = {
      category: "clothing",
      title: "Suknelė",
      description: "Zara suknelė dydis M",
      attributes: { material: "šilkas" },
    };
    const { delta } = runEnrichmentConsumer(serverDraft);
    assert.equal(hasSyncableDelta(delta), true);
    const attrs = (delta.attributes ?? {}) as Record<string, unknown>;
    assert.equal(attrs.condition, "Gera", "client clothing default is a real canonical fact");
    assert.equal(typeof attrs.fashionCategory, "string", "fashionCategory is proposed");
    assert.equal(attrs.size, "M", "detected size is proposed");
    assert.equal(attrs.material, undefined, "unchanged unrelated attribute is not re-proposed");
    assert.equal(attrs.editedByUser, undefined, "client metadata excluded");
    assert.equal(attrs.confirmationToken, undefined, "provenance excluded");
  });

  it("vehicle enrichment produces a canonical minimal delta", () => {
    const serverDraft = {
      category: "vehicles",
      title: "",
      description: "Volkswagen Golf 2018",
      attributes: {},
    };
    const { delta } = runEnrichmentConsumer(serverDraft);
    assert.equal(hasSyncableDelta(delta), true);
    assert.equal(delta.title, "Volkswagen Golf 2018", "enriched title is proposed");
    const attrs = (delta.attributes ?? {}) as Record<string, unknown>;
    assert.equal(attrs.make, "Volkswagen");
    assert.equal(attrs.model, "Golf");
    assert.equal(attrs.year, "2018");
    assert.equal(attrs.vinCandidate, undefined, "VIN candidate must never reach canonical state");
  });

  it("already-enriched canonical draft yields no delta (no sync loop)", () => {
    const serverDraft = {
      category: "clothing",
      title: "Suknelė",
      description: "Zara suknelė dydis M",
      attributes: {},
    };
    const first = runEnrichmentConsumer(serverDraft);
    assert.equal(hasSyncableDelta(first.delta), true);
    // The canonical server now holds the enriched draft (recovered state).
    const recovered = first.enriched;
    const second = runEnrichmentConsumer({
      category: "clothing",
      title: recovered.title as string | undefined,
      description: recovered.description as string | undefined,
      attributes: recovered.attributes as Record<string, string | string[] | undefined>,
    });
    assert.equal(hasSyncableDelta(second.delta), false, "recovered/already-enriched state must not re-sync");
  });
});

describe("FC-1 — enrichment canonical recovery", () => {
  it("immediate close/clear does not lose enrichment on canonical recovery", async () => {
    const server = installDraftServer({
      draft: {
        category: "clothing",
        title: "Suknelė",
        description: "Zara suknelė dydis M",
        attributes: {},
      },
      version: 1,
    });
    persistAgentThreadLink({ threadId: "thr-1", version: 1 });

    const { delta } = runEnrichmentConsumer({
      category: "clothing",
      title: "Suknelė",
      description: "Zara suknelė dydis M",
      attributes: {},
    });
    assert.equal(hasSyncableDelta(delta), true);

    const sync = await syncAgentListingDraft({ delta });
    assert.equal(sync.ok, true);
    assert.equal(server.getCanonical().version, 2);

    // Browser closes / client state cleared — no further manual edit.
    storage.clear();

    const recovered = await reDiscoverAgentDraft("thr-1");
    assert.equal(recovered.ok, true);
    if (recovered.ok) {
      const attrs = (recovered.draft.attributes ?? {}) as Record<string, unknown>;
      assert.equal(attrs.condition, "Gera", "enrichment fact survives recovery");
      assert.equal(typeof attrs.fashionCategory, "string");
      assert.equal(recovered.version, 2);
    }
  });
});

describe("FC-1 — stale recovery + guest boundary", () => {
  it("stale enrichment update cannot overwrite newer state and re-discovers authority", async () => {
    const server = installDraftServer({
      draft: { title: "Naujesnis skelbimas", attributes: { condition: "Naudotas" } },
      version: 3,
    });
    persistAgentThreadLink({ threadId: "thr-1", version: 1 });

    const result = await syncAgentListingDraft({ delta: { price: 999 } });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "stale_version");
      assert.equal(result.version, 3, "re-discovery returns the newer canonical version");
    }
    assert.equal(readAgentThreadLink()?.version, 3, "mirror version refreshed to authority");
    // Newer canonical state was never overwritten.
    assert.equal(server.getCanonical().draft.title, "Naujesnis skelbimas");
    assert.equal(
      (server.getCanonical().draft.attributes as Record<string, unknown>).price,
      undefined
    );
  });

  it("guest (no thread link) cannot invoke canonical persistence", async () => {
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    }) as typeof fetch;

    const result = await syncAgentListingDraft({ delta: { price: 1 } });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "auth_required");
    assert.equal(fetchCalled, false, "no network call for a guest");
  });

  it("draft sync never targets a publish endpoint", async () => {
    const server = installDraftServer({
      draft: { category: "clothing", title: "Suknelė", attributes: {} },
      version: 1,
    });
    persistAgentThreadLink({ threadId: "thr-1", version: 1 });

    const { delta } = runEnrichmentConsumer({
      category: "clothing",
      title: "Suknelė",
      description: "Zara suknelė dydis M",
      attributes: {},
    });
    await syncAgentListingDraft({ delta });

    for (const url of server.urls) {
      assert.ok(
        url.includes("/draft"),
        `unexpected endpoint contacted: ${url}`
      );
      assert.ok(!/\/listing|publish|prepublish/i.test(url), `publish endpoint touched: ${url}`);
    }
  });
});
