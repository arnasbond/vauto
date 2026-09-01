/**
 * F6.1/F6.2 — professional seller bulk listing control route.
 *
 * PREVIEW → HUMAN CONFIRMATION → EXECUTION (+ safe RECOVERY) boundary for
 * hide (soft-delete) / republish (restore) across the seller's OWN listings.
 * Mounted with `actionRateLimiter` + `requireAuth` in server/src/index.ts.
 * The LLM has NO tool for this boundary — only the trusted client UI may
 * call it, and nothing executes without the exact opaque digest minted by
 * the preview.
 *
 * F6.2: execution is DURABLE — a PostgreSQL store (unique claim per
 * actor+operation+key, per-item outcomes, append-only audit) survives
 * restarts and multi-process concurrency. Replays return the saved result;
 * interrupted operations fail closed to `recovery_required` and are
 * completed only through the explicit, status-verifying /recover endpoint.
 *
 * Fail-closed feature gate: in production, execution is OFF by default until
 * the durable wave is certified; the preview then reports
 * `executionEnabled: false` and mints no digest.
 */
import { Router } from "express";
import type { AuthedRequest } from "../middleware/auth.js";
import {
  BULK_MAX_TARGETS,
  BULK_OPERATIONS,
  buildBulkProposal,
  bulkExecutionEnabled,
  canRunBulkOperations,
  executeBulkOperationDurable,
  recoverBulkOperation,
  validateBulkTargetIds,
  type BulkOperation,
} from "../ai/bulk-listing-control.js";
import {
  createPostgresBulkOperationStore,
  type BulkOperationStore,
} from "../ai/bulk/bulk-store.js";
import {
  deleteListing,
  getListings,
  getListingForEmbedding,
  restoreListing,
} from "../repository.js";
import { pool } from "../db.js";

const router = Router();

function signingKey(): string {
  return (
    process.env.BULK_PROPOSAL_SECRET ||
    process.env.JWT_SECRET ||
    "vauto-dev-secret-change-in-production"
  );
}

let defaultStore: BulkOperationStore | null = null;

function getDefaultStore(): BulkOperationStore {
  if (!defaultStore) {
    defaultStore = createPostgresBulkOperationStore(pool);
  }
  return defaultStore;
}

/** Test seam — same convention as the consequential-action router. */
let testStore: BulkOperationStore | null = null;
let executors: {
  applyItem: (listingId: string) => Promise<{ ok: boolean; detail?: string }>;
  resolveListings: () => Promise<Array<{ id: string; sellerId: string; banned?: boolean; title?: string; category?: string; status?: string }>>;
  readListingStatus?: (listingId: string) => Promise<{ status: string } | null>;
} | null = null;

export function setBulkStoreForTests(store: BulkOperationStore | null): void {
  testStore = store;
}

export function setBulkExecutorsForTests(next: typeof executors): void {
  executors = next;
}

function defaultResolveListings() {
  return getListings();
}

async function defaultReadListingStatus(listingId: string): Promise<{ status: string } | null> {
  const listing = await getListingForEmbedding(listingId);
  return listing ? { status: listing.status ?? "active" } : null;
}

function defaultApplyItem(operation: BulkOperation) {
  return async (listingId: string, actorId: string) => {
    if (operation === "republish") {
      const restored = await restoreListing(listingId, actorId);
      return restored ? { ok: true, detail: "republished" } : { ok: false, detail: "not_restored" };
    }
    const deleted = await deleteListing(listingId, actorId);
    return deleted ? { ok: true, detail: "hidden" } : { ok: false, detail: "not_applied" };
  };
}

router.post("/preview", async (req: AuthedRequest, res) => {
  try {
    const actorId = req.authUserId;
    if (!actorId) {
      return res.status(401).json({ error: "Prisijungimas nebegalioja." });
    }
    if (!canRunBulkOperations(req.authRole)) {
      return res.status(403).json({ error: "Tik verslo pardavėjams." });
    }
    const body = (req.body ?? {}) as { listingIds?: unknown; operation?: unknown };
    const operation = String(body.operation ?? "").trim() as BulkOperation;
    if (!(BULK_OPERATIONS as readonly string[]).includes(operation)) {
      return res.status(400).json({ error: "Nepalaikoma operacija." });
    }
    const validated = validateBulkTargetIds(body.listingIds);
    if (!validated.ok) {
      return res.status(400).json({ ok: false, code: "invalid_payload", error: validated.message });
    }
    if (validated.ids.length > BULK_MAX_TARGETS) {
      return res.status(400).json({ error: `Daugiausia ${BULK_MAX_TARGETS} skelbimų vienu metu.` });
    }
    const enabled = bulkExecutionEnabled();
    const listings = executors ? await executors.resolveListings() : await defaultResolveListings();
    const { proposal, digest } = buildBulkProposal({
      actorId,
      listings,
      requestedIds: validated.ids,
      operation,
      signingKey: signingKey(),
    });
    if (!enabled) {
      proposal.warnings.push("Bulk vykdymas šioje aplinkoje išjungtas — preview tik informacinis.");
    }
    return res.json({ digest: enabled ? digest : null, proposal, executionEnabled: enabled });
  } catch (e) {
    console.warn("[bulk-listings] preview failed:", e);
    return res.status(503).json({ error: "Laikinai nepasiekiama." });
  }
});

router.post("/confirm", async (req: AuthedRequest, res) => {
  try {
    const actorId = req.authUserId;
    if (!actorId) {
      return res.status(401).json({ error: "Prisijungimas nebegalioja." });
    }
    if (!canRunBulkOperations(req.authRole)) {
      return res.status(403).json({ error: "Tik verslo pardavėjams." });
    }
    if (!bulkExecutionEnabled()) {
      return res.status(403).json({ ok: false, code: "disabled", error: "Bulk vykdymas išjungtas šioje aplinkoje." });
    }
    const body = (req.body ?? {}) as {
      digest?: unknown;
      proposalExpiresAt?: unknown;
      operation?: unknown;
      listingIds?: unknown;
      idempotencyKey?: unknown;
    };
    const operation = String(body.operation ?? "").trim() as BulkOperation;
    const digest = String(body.digest ?? "").trim();
    const proposalExpiresAt = Number(body.proposalExpiresAt);
    const idempotencyKey = String(body.idempotencyKey ?? "").trim();
    const validated = validateBulkTargetIds(body.listingIds);

    if (!digest || !idempotencyKey || !validated.ok || !Number.isFinite(proposalExpiresAt)) {
      if (!validated.ok) {
        return res.status(400).json({ ok: false, code: "invalid_payload", error: validated.message });
      }
      return res.status(400).json({ error: "Trūksta patvirtinimo duomenų." });
    }
    if (validated.ids.length > BULK_MAX_TARGETS) {
      return res.status(400).json({ error: `Daugiausia ${BULK_MAX_TARGETS} skelbimų vienu metu.` });
    }

    const result = await executeBulkOperationDurable({
      actorId,
      actorRole: req.authRole,
      operation,
      targetIds: validated.ids,
      digest,
      proposalExpiresAt,
      idempotencyKey,
      signingKey: signingKey(),
      store: testStore ?? getDefaultStore(),
      applyItem: async (listingId) => {
        if (executors) return executors.applyItem(listingId);
        return defaultApplyItem(operation)(listingId, actorId);
      },
      resolveListings: executors
        ? executors.resolveListings
        : async () => defaultResolveListings(),
    });

    if (!result.ok) {
      const status =
        result.code === "expired" || result.code === "tampered" || result.code === "recovery_required"
          ? 409
          : result.code === "unauthorized" || result.code === "disabled"
            ? 403
            : 400;
      return res.status(status).json({ ok: false, code: result.code, error: result.message, state: result.state });
    }

    return res.json({
      ok: true,
      outcomes: result.outcomes,
      audit: result.audit,
      executed: result.executed,
      replayed: result.replayed,
      state: result.state,
    });
  } catch (e) {
    console.warn("[bulk-listings] confirm failed:", e);
    return res.status(503).json({ error: "Laikinai nepasiekiama." });
  }
});

router.post("/recover", async (req: AuthedRequest, res) => {
  try {
    const actorId = req.authUserId;
    if (!actorId) {
      return res.status(401).json({ error: "Prisijungimas nebegalioja." });
    }
    if (!canRunBulkOperations(req.authRole)) {
      return res.status(403).json({ error: "Tik verslo pardavėjams." });
    }
    if (!bulkExecutionEnabled()) {
      return res.status(403).json({ ok: false, code: "disabled", error: "Bulk vykdymas išjungtas šioje aplinkoje." });
    }
    const body = (req.body ?? {}) as { operation?: unknown; idempotencyKey?: unknown };
    const operation = String(body.operation ?? "").trim() as BulkOperation;
    const idempotencyKey = String(body.idempotencyKey ?? "").trim();
    if (!(BULK_OPERATIONS as readonly string[]).includes(operation) || !idempotencyKey) {
      return res.status(400).json({ error: "Trūksta atkūrimo duomenų." });
    }

    const result = await recoverBulkOperation({
      actorId,
      actorRole: req.authRole,
      operation,
      idempotencyKey,
      store: testStore ?? getDefaultStore(),
      readListingStatus: executors?.readListingStatus
        ? executors.readListingStatus
        : defaultReadListingStatus,
      applyItem: async (listingId) => {
        if (executors) return executors.applyItem(listingId);
        return defaultApplyItem(operation)(listingId, actorId);
      },
    });

    if (!result.ok) {
      const status = result.code === "recovery_required" ? 409 : result.code === "unauthorized" ? 403 : 400;
      return res.status(status).json({ ok: false, code: result.code, error: result.message, state: result.state });
    }
    return res.json({
      ok: true,
      outcomes: result.outcomes,
      executed: result.executed,
      replayed: result.replayed,
      state: result.state,
    });
  } catch (e) {
    console.warn("[bulk-listings] recover failed:", e);
    return res.status(503).json({ error: "Laikinai nepasiekiama." });
  }
});

export default router;
export { router as bulkListingsRouter };
