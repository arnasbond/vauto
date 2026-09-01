/**
 * F6.1 — professional seller bulk listing control core.
 *
 * Deterministic, category-neutral (all 7 verticals share ONE path), no AI:
 * the LLM has NO tool for this boundary — only a trusted client UI may
 * request a preview and a human must explicitly confirm the proposal before
 * any bulk operation executes.
 *
 * Guarantees:
 *   - ownership: an actor can only ever operate on their OWN listings
 *     (fresh ownership re-check at execution time — forged/foreign/unknown
 *     target IDs fail closed);
 *   - preview + human confirmation: execution requires the exact opaque
 *     digest minted by the preview (HMAC over actor + canonical target set +
 *     operation + expiry), with a hard TTL;
 *   - idempotency: one correlation key executes a bulk operation exactly once
 *     — replays are reported as skipped, never re-applied;
 *   - partial failure: per-item success/failed/skipped outcomes, already
 *     applied results are never hidden by later failures;
 *   - audit trail: structured actor/action/targets/outcome/correlation
 *     records (response-level; durable persistence is next-wave debt).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const BULK_OPERATIONS = ["unpublish", "republish", "delete"] as const;
export type BulkOperation = (typeof BULK_OPERATIONS)[number];

export const BULK_PROPOSAL_TTL_MS = 5 * 60_000;
export const BULK_MAX_TARGETS = 100;

/** Business-seller gate: pro / admin / super_admin only. */
export function canRunBulkOperations(role: string | null | undefined): boolean {
  const r = String(role ?? "").trim().toLowerCase();
  return r === "pro" || r === "admin" || r === "super_admin";
}

export type BulkListingRow = {
  id: string;
  sellerId: string;
  banned?: boolean;
  title?: string;
  category?: string;
  status?: string;
};

export type BulkTargetVerdict =
  | { status: "owned"; listingId: string; title: string; category: string }
  | { status: "foreign"; listingId: string }
  | { status: "not_found"; listingId: string }
  | { status: "invalid"; listingId: string };

function normalizeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const id of raw) {
    const s = String(id ?? "").trim();
    if (!s || s.length > 100) continue;
    if (!out.includes(s)) out.push(s);
    if (out.length >= BULK_MAX_TARGETS) break;
  }
  return out;
}

/**
 * Classify every requested target against the actor's ownership. Fail-closed:
 * banned listings are invalid, foreign listings are rejected, unknown ids are
 * not_found. Never throws.
 */
export function classifyBulkTargets(input: {
  actorId: string;
  listings: BulkListingRow[];
  requestedIds: string[];
}): {
  verdicts: BulkTargetVerdict[];
  ownedIds: string[];
  foreignIds: string[];
} {
  const byId = new Map(input.listings.map((l) => [String(l.id).trim(), l]));
  const verdicts: BulkTargetVerdict[] = [];
  const ownedIds: string[] = [];
  const foreignIds: string[] = [];
  for (const id of input.requestedIds) {
    const row = byId.get(id);
    if (!row) {
      verdicts.push({ status: "not_found", listingId: id });
      continue;
    }
    if (row.banned) {
      verdicts.push({ status: "invalid", listingId: id });
      continue;
    }
    if (row.sellerId !== input.actorId) {
      verdicts.push({ status: "foreign", listingId: id });
      foreignIds.push(id);
      continue;
    }
    verdicts.push({
      status: "owned",
      listingId: id,
      title: String(row.title ?? "").slice(0, 120),
      category: String(row.category ?? "other").slice(0, 40),
    });
    ownedIds.push(id);
  }
  return { verdicts, ownedIds, foreignIds };
}

function canonicalDigestPayload(input: {
  actorId: string;
  ownedIds: string[];
  operation: BulkOperation;
  expiresAt: number;
}): string {
  return JSON.stringify({
    actorId: input.actorId,
    ids: [...input.ownedIds].sort(),
    operation: input.operation,
    expiresAt: input.expiresAt,
  });
}

export function signBulkProposal(
  input: {
    actorId: string;
    ownedIds: string[];
    operation: BulkOperation;
    expiresAt: number;
  },
  signingKey: string
): string {
  return createHmac("sha256", signingKey)
    .update(canonicalDigestPayload(input))
    .digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export type BulkProposal = {
  operation: BulkOperation;
  expiresAt: number;
  items: BulkTargetVerdict[];
  ownedCount: number;
  warnings: string[];
};

/**
 * Human-review preview: classify the requested targets, mint an opaque digest
 * over the CONFIRMABLE (owned) set, and surface every warning. No execution.
 */
export function buildBulkProposal(input: {
  actorId: string;
  listings: BulkListingRow[];
  requestedIds: string[];
  operation: BulkOperation;
  signingKey: string;
  nowMs?: number;
}): { proposal: BulkProposal; digest: string } {
  const now = input.nowMs ?? Date.now();
  const expiresAt = now + BULK_PROPOSAL_TTL_MS;
  const { verdicts, ownedIds, foreignIds } = classifyBulkTargets({
    actorId: input.actorId,
    listings: input.listings,
    requestedIds: normalizeIds(input.requestedIds),
  });
  const warnings: string[] = [];
  for (const v of verdicts) {
    if (v.status === "foreign") warnings.push(`Svetimas skelbimas atmestas: ${v.listingId}`);
    if (v.status === "not_found") warnings.push(`Skelbimas nerastas: ${v.listingId}`);
    if (v.status === "invalid") warnings.push(`Skelbimas negalimas (uždraustas): ${v.listingId}`);
  }
  if (ownedIds.length === 0) warnings.push("Nėra patvirtinamų skelbimų.");
  void foreignIds;
  return {
    proposal: {
      operation: input.operation,
      expiresAt,
      items: verdicts,
      ownedCount: ownedIds.length,
      warnings,
    },
    digest: signBulkProposal(
      { actorId: input.actorId, ownedIds, operation: input.operation, expiresAt },
      input.signingKey
    ),
  };
}

export type BulkItemOutcome =
  | { id: string; status: "success"; detail: string }
  | { id: string; status: "failed"; reason: string }
  | { id: string; status: "skipped"; reason: string };

export type BulkAuditEntry = {
  actorId: string;
  action: string;
  targetId: string;
  outcome: string;
  correlation: string;
  timestamp: number;
};

export type BulkExecutionResult =
  | {
      ok: true;
      outcomes: BulkItemOutcome[];
      audit: BulkAuditEntry[];
      executed: boolean;
    }
  | { ok: false; code: "expired" | "tampered" | "invalid_operation" | "unauthorized" | "empty_targets" | "duplicate"; message: string };

/**
 * Execute a human-confirmed bulk operation. Fail-closed at every boundary:
 * expiry, digest tampering, role, fresh ownership, idempotency.
 *
 * `executedKeys` is the caller's registry (route keeps it in-memory); the key
 * is claimed BEFORE any item is applied so replays can never double-apply.
 */
export async function executeBulkOperation(input: {
  actorId: string;
  actorRole: string | null | undefined;
  operation: BulkOperation;
  targetIds: string[];
  digest: string;
  proposalExpiresAt: number;
  idempotencyKey: string;
  signingKey: string;
  executedKeys: Set<string>;
  applyItem: (listingId: string) => Promise<{ ok: boolean; detail?: string }>;
  resolveListings: () => Promise<BulkListingRow[]>;
  nowMs?: number;
}): Promise<BulkExecutionResult> {
  const now = input.nowMs ?? Date.now();
  const operation = input.operation as BulkOperation;
  if (!(BULK_OPERATIONS as readonly string[]).includes(operation)) {
    return { ok: false, code: "invalid_operation", message: "Nepalaikoma operacija." };
  }
  if (!canRunBulkOperations(input.actorRole)) {
    return { ok: false, code: "unauthorized", message: "Tik verslo pardavėjams." };
  }
  const ids = normalizeIds(input.targetIds);
  if (ids.length === 0) {
    return { ok: false, code: "empty_targets", message: "Nėra patvirtinamų skelbimų." };
  }
  const key = String(input.idempotencyKey ?? "").trim();
  if (!key || key.length > 160) {
    return { ok: false, code: "duplicate", message: "Trūksta idempotency rakto." };
  }
  if (input.proposalExpiresAt <= now) {
    return { ok: false, code: "expired", message: "Patvirtinimas pasibaigė — sukurkite naują preview." };
  }

  const listings = await input.resolveListings();
  const { ownedIds, foreignIds } = classifyBulkTargets({
    actorId: input.actorId,
    listings,
    requestedIds: ids,
  });

  const expectedDigest = signBulkProposal(
    { actorId: input.actorId, ownedIds, operation, expiresAt: input.proposalExpiresAt },
    input.signingKey
  );
  if (!safeEqual(input.digest, expectedDigest)) {
    return { ok: false, code: "tampered", message: "Proposal pakeistas — atnaujinkite preview." };
  }

  const outcomes: BulkItemOutcome[] = [];
  const audit: BulkAuditEntry[] = [];
  const action = `bulk:${operation}`;
  const claimed = !input.executedKeys.has(key);
  if (!claimed) {
    for (const id of ids) {
      const reason = "duplicate_request";
      outcomes.push({ id, status: "skipped", reason });
      audit.push({ actorId: input.actorId, action, targetId: id, outcome: `skipped:${reason}`, correlation: key, timestamp: now });
    }
    return { ok: true, outcomes, audit, executed: false };
  }
  input.executedKeys.add(key);

  const foreignSet = new Set(foreignIds);
  for (const id of ids) {
    if (!ownedIds.includes(id)) {
      const reason = foreignSet.has(id) ? "not_owned" : "not_found";
      outcomes.push({ id, status: "failed", reason });
      audit.push({ actorId: input.actorId, action, targetId: id, outcome: `failed:${reason}`, correlation: key, timestamp: now });
      continue;
    }
    try {
      const applied = await input.applyItem(id);
      if (applied.ok) {
        outcomes.push({ id, status: "success", detail: applied.detail ?? operation });
        audit.push({ actorId: input.actorId, action, targetId: id, outcome: "success", correlation: key, timestamp: now });
      } else {
        outcomes.push({ id, status: "failed", reason: applied.detail ?? "apply_failed" });
        audit.push({ actorId: input.actorId, action, targetId: id, outcome: `failed:${applied.detail ?? "apply_failed"}`, correlation: key, timestamp: now });
      }
    } catch {
      outcomes.push({ id, status: "failed", reason: "apply_error" });
      audit.push({ actorId: input.actorId, action, targetId: id, outcome: "failed:apply_error", correlation: key, timestamp: now });
    }
  }

  return { ok: true, outcomes, audit, executed: true };
}
