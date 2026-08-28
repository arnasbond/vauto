/**
 * VAUTO AI Maturity — Phase 1: Consequential Action Confirmation Boundary.
 *
 * The ONLY HTTP surface that may execute `markListingSold` / `blockListing`
 * mutations. It is never reachable from LLM/tool-call text — only from an
 * explicit, authenticated, user-triggered confirmation carrying the exact
 * opaque `pendingActionId` minted by the tool proposal
 * (see server/src/ai/agent-tools.ts).
 *
 * Mounted with `requireAuth` in server/src/index.ts — `req.authUserId` is
 * always the live, session-authenticated user, never a client-supplied
 * value.
 */
import { Router } from "express";
import type { AuthedRequest } from "../middleware/auth.js";
import { userIsAdmin } from "../middleware/auth.js";
import {
  cancelConsequentialAction,
  confirmConsequentialAction,
  getConfirmationBoundaryState,
  getDefaultPendingActionStore,
  type CancelFailureReason,
  type ConfirmationFailureReason,
  type ConsequentialActionType,
} from "../ai/confirmation/consequential-action-policy.js";
import { getListingForEmbedding } from "../repository.js";
import { notifySellerListingRejected } from "../push/listing-moderation-notify.js";
import { createPoolTxQueryable } from "../transaction/tx-connection.js";
import {
  markListingSoldAtomic,
  setListingBannedAtomic,
  type AtomicBanResult,
  type AtomicMarkSoldResult,
} from "../ai/confirmation/atomic-listing-ops.js";

const BOUNDARY_UNAVAILABLE_BODY = {
  error: "Patvirtinimo sistema ruošiama — pabandykite po kelių sekundžių.",
  code: "confirmation_boundary_unavailable" as const,
};

export const consequentialActionsRouter = Router();

function isConsequentialActionType(value: unknown): value is ConsequentialActionType {
  return value === "markListingSold" || value === "blockListing";
}

const CONFIRM_FAILURE_STATUS: Record<ConfirmationFailureReason, number> = {
  not_found: 404,
  wrong_user: 403,
  cancelled: 409,
  type_mismatch: 400,
  target_mismatch: 400,
  expired: 410,
  execution_failed: 500,
  still_processing: 503,
};

const CONFIRM_FAILURE_MESSAGE: Record<ConfirmationFailureReason, string> = {
  not_found: "Patvirtinimas nerastas arba nebegalioja.",
  wrong_user: "Neturite teisės patvirtinti šio veiksmo.",
  cancelled: "Veiksmas buvo atšauktas.",
  type_mismatch: "Patvirtinimas neatitinka veiksmo tipo.",
  target_mismatch: "Patvirtinimas neatitinka tikslo.",
  expired: "Patvirtinimo laikas baigėsi — pabandykite iš naujo.",
  execution_failed: "Nepavyko įvykdyti veiksmo. Norėdami bandyti dar kartą, paprašykite iš naujo.",
  still_processing: "Veiksmas dar vykdomas — pabandykite po kelių sekundžių.",
};

const CANCEL_FAILURE_STATUS: Record<CancelFailureReason, number> = {
  not_found: 404,
  wrong_user: 403,
  already_consumed: 409,
};

const CANCEL_FAILURE_MESSAGE: Record<CancelFailureReason, string> = {
  not_found: "Patvirtinimas nerastas arba nebegalioja.",
  wrong_user: "Neturite teisės atšaukti šio veiksmo.",
  already_consumed: "Veiksmas jau įvykdytas — atšaukti nepavyko.",
};

interface ExecutionResult {
  ok: boolean;
  listingId: string;
  title?: string;
  reason?: "ownership_changed" | "role_changed" | "target_not_found";
  /** True only when reconciliation found the target already in the desired terminal state. */
  alreadyDone?: boolean;
}

/**
 * Repository-call seam (mirrors `setTxQueryableOverride` /
 * `setSellerConnectOverride` conventions used elsewhere in this codebase),
 * used by BOTH executors below. Production always binds the real atomic
 * repository operations (atomic-listing-ops.ts) to the real pooled
 * PostgreSQL connection; unit tests inject fakes so the REAL reconciliation
 * branching below (already-sold / already-banned / no-duplicate-
 * notification) runs against deterministic fixtures instead of a live
 * PostgreSQL connection. A SEPARATE test file
 * (ai/confirmation/__tests__/atomic-listing-ops.test.ts) proves the atomic
 * operations THEMSELVES against a real PGlite engine — this seam exists so
 * THIS file's executor-level branching (role checks, notify-once) can be
 * tested independently of that.
 */
export interface ConsequentialActionRepoOps {
  markListingSoldAtomic: (
    listingId: string,
    sellerId: string
  ) => Promise<AtomicMarkSoldResult | null>;
  setListingBannedAtomic: (listingId: string) => Promise<AtomicBanResult | null>;
  getListingForEmbedding: typeof getListingForEmbedding;
  userIsAdmin: (req: AuthedRequest) => Promise<boolean>;
  notifySellerListingRejected: typeof notifySellerListingRejected;
}
let repoOpsOverride: ConsequentialActionRepoOps | null = null;
export function setConsequentialActionRepoOpsForTests(
  overrides: ConsequentialActionRepoOps | null
): void {
  repoOpsOverride = overrides;
}
function repoOps(): ConsequentialActionRepoOps {
  return (
    repoOpsOverride ?? {
      markListingSoldAtomic: (listingId, sellerId) =>
        markListingSoldAtomic(createPoolTxQueryable(), listingId, sellerId),
      setListingBannedAtomic: (listingId) =>
        setListingBannedAtomic(createPoolTxQueryable(), listingId),
      getListingForEmbedding,
      userIsAdmin,
      notifySellerListingRejected,
    }
  );
}

/**
 * Fresh ownership re-check at EXECUTION time — never trusts the
 * proposal-time snapshot. `markListingSoldAtomic` (atomic-listing-ops.ts) is
 * itself the idempotent, genuinely-atomic domain operation (single
 * conditional UPDATE + users.sold_count increment in one transaction) —
 * this function does nothing but call it and translate the result. Safe to
 * repeat any number of times, including two genuinely overlapping calls
 * (crash-recovery remediation A): at most one ever performs the real
 * transition and increments the counter.
 */
async function executeMarkListingSold(
  targetId: string,
  authUserId: string
): Promise<ExecutionResult> {
  const ops = repoOps();
  const result = await ops.markListingSoldAtomic(targetId, authUserId);
  if (!result) {
    return { ok: false, listingId: targetId, reason: "ownership_changed" };
  }
  return {
    ok: true,
    listingId: targetId,
    title: result.title,
    alreadyDone: result.alreadyDone || undefined,
  };
}

/**
 * Fresh admin-role re-check at EXECUTION time — never trusts the
 * proposal-time snapshot. `setListingBannedAtomic` (atomic-listing-ops.ts)
 * is the idempotent, genuinely-atomic domain operation (single conditional
 * UPDATE); the moderation notification is only ever enqueued when
 * `alreadyDone` is false — i.e. only by the ONE call whose UPDATE actually
 * flipped `banned` false -> true, even if two calls genuinely overlap
 * (crash-recovery remediation A).
 */
async function executeBlockListing(
  req: AuthedRequest,
  targetId: string
): Promise<ExecutionResult> {
  const ops = repoOps();
  if (!(await ops.userIsAdmin(req))) {
    return { ok: false, listingId: targetId, reason: "role_changed" };
  }
  const result = await ops.setListingBannedAtomic(targetId);
  if (!result) {
    return { ok: false, listingId: targetId, reason: "target_not_found" };
  }
  if (!result.alreadyDone) {
    const fresh = await ops.getListingForEmbedding(targetId);
    if (fresh) void ops.notifySellerListingRejected(fresh).catch(() => {});
  }
  return {
    ok: true,
    listingId: targetId,
    title: result.title,
    alreadyDone: result.alreadyDone || undefined,
  };
}

/**
 * Test-only injection point (mirrors `setTxQueryableOverride` /
 * `setSellerConnectOverride` conventions used elsewhere in this codebase).
 * Production code path always uses the real repository functions above;
 * HTTP-level tests for this router that don't care about reconciliation
 * nuances swap in whole fakes so they can exercise auth-binding / mismatch /
 * replay / concurrency behavior without a live PostgreSQL connection. Tests
 * that DO care about reconciliation (already-sold / already-banned / no
 * duplicate notification) use `setConsequentialActionRepoOpsForTests`
 * instead, which keeps the real executor logic above intact.
 */
type Executors = {
  markListingSold: typeof executeMarkListingSold;
  blockListing: typeof executeBlockListing;
};
let executorOverride: Executors | null = null;
export function setConsequentialActionExecutorsForTests(overrides: Executors | null): void {
  executorOverride = overrides;
}

/**
 * Test-only re-export of the real (module-private) executors, so recovery/
 * reconciliation tests (already-sold, already-banned, no duplicate
 * notification) can drive the ACTUAL production functions directly —
 * combined with `setConsequentialActionRepoOpsForTests` above, this proves
 * the real code path, not a hand-rolled stand-in.
 */
export const __executeMarkListingSoldForTests = executeMarkListingSold;
export const __executeBlockListingForTests = executeBlockListing;

consequentialActionsRouter.post("/confirm", async (req: AuthedRequest, res) => {
  // Fail closed (2nd audit, remediation B): while bootstrapping (or if
  // migrations ever fail), there is NO installed store at all — never fall
  // back to an in-memory one in production. Checked before auth so a
  // bootstrapping process never even inspects the body/session.
  if (getConfirmationBoundaryState() !== "READY") {
    res.status(503).json(BOUNDARY_UNAVAILABLE_BODY);
    return;
  }

  const authUserId = req.authUserId;
  if (!authUserId) {
    res.status(401).json({ error: "Prisijungimas nebegalioja." });
    return;
  }

  const pendingActionId = String(req.body?.pendingActionId ?? "").trim();
  const type = req.body?.type;
  const targetId = String(req.body?.targetId ?? "").trim();
  if (!pendingActionId || !isConsequentialActionType(type) || !targetId) {
    res.status(400).json({ error: "Trūksta pendingActionId, type arba targetId." });
    return;
  }

  const executors = executorOverride ?? {
    markListingSold: executeMarkListingSold,
    blockListing: executeBlockListing,
  };

  try {
    const outcome = await confirmConsequentialAction(
      getDefaultPendingActionStore(),
      { pendingActionId, userId: authUserId, type, targetId },
      async (action) =>
        action.type === "markListingSold"
          ? executors.markListingSold(action.targetId, authUserId)
          : executors.blockListing(req, action.targetId)
    );

    if (!outcome.ok) {
      res.status(CONFIRM_FAILURE_STATUS[outcome.reason]).json({
        error: CONFIRM_FAILURE_MESSAGE[outcome.reason],
        replay: outcome.replay === true,
      });
      return;
    }

    res.json({ ok: true, replay: outcome.replay, result: outcome.result });
  } catch (e) {
    // confirmConsequentialAction itself never throws for a well-formed
    // executor (execute() exceptions are caught internally and turned into
    // a typed "execution_failed" outcome above) — this only guards against
    // programmer error / malformed input reaching this far.
    res.status(500).json({
      error: e instanceof Error ? e.message : "Nepavyko patvirtinti veiksmo.",
    });
  }
});

consequentialActionsRouter.post("/cancel", async (req: AuthedRequest, res) => {
  // Fail closed (2nd audit, remediation B) — see /confirm above.
  if (getConfirmationBoundaryState() !== "READY") {
    res.status(503).json(BOUNDARY_UNAVAILABLE_BODY);
    return;
  }

  const authUserId = req.authUserId;
  if (!authUserId) {
    res.status(401).json({ error: "Prisijungimas nebegalioja." });
    return;
  }

  const pendingActionId = String(req.body?.pendingActionId ?? "").trim();
  if (!pendingActionId) {
    res.status(400).json({ error: "Trūksta pendingActionId." });
    return;
  }

  const outcome = await cancelConsequentialAction(getDefaultPendingActionStore(), {
    pendingActionId,
    userId: authUserId,
  });

  if (!outcome.ok) {
    res.status(CANCEL_FAILURE_STATUS[outcome.reason]).json({
      error: CANCEL_FAILURE_MESSAGE[outcome.reason],
    });
    return;
  }

  res.json({ ok: true });
});
