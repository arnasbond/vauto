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
 *   - preview + human confirmation: the opaque digest covers the ENTIRE
 *     normalized confirmed proposal image (actor + every requested target
 *     WITH its verdict + operation + expiry) — adding, removing or changing
 *     any target at confirm time yields 409 and executes nothing;
 *   - idempotency: the registry key is scoped to actorId + operation +
 *     idempotencyKey, so different sellers can never block each other and a
 *     replay never double-applies;
 *   - fail-closed feature gate: in production, bulk execution is OFF by
 *     default (no durable idempotency/audit persistence yet) and requires an
 *     explicit safe opt-in; the preview never promises execution while the
 *     gate is closed;
 *   - one precisely-named soft operation ("hide" = soft-delete from the
 *     public catalog, "republish" = restore) — no aliases pretending to be
 *     different actions;
 *   - partial failure: per-item success/failed/skipped outcomes, already
 *     applied results are never hidden by later failures;
 *   - audit trail: structured actor/action/targets/outcome/correlation
 *     records (response-level; durable persistence is next-wave debt).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const BULK_OPERATIONS = ["hide", "republish"] as const;
export type BulkOperation = (typeof BULK_OPERATIONS)[number];

export const BULK_PROPOSAL_TTL_MS = 5 * 60_000;
export const BULK_MAX_TARGETS = 100;

/** Business-seller gate: pro / admin / super_admin only. */
export function canRunBulkOperations(role: string | null | undefined): boolean {
  const r = String(role ?? "").trim().toLowerCase();
  return r === "pro" || r === "admin" || r === "super_admin";
}

/**
 * Fail-closed feature gate: bulk execution is OFF in production by default
 * (process-local idempotency + response-only audit are not production
 * guarantees yet). An explicit, deliberately-named opt-in enables it.
 */
export function bulkExecutionEnabled(
  env: { NODE_ENV?: string; VAUTO_ENABLE_BULK_LISTING_OPS?: string } = process.env
): boolean {
  if (env.NODE_ENV === "production") {
    return env.VAUTO_ENABLE_BULK_LISTING_OPS === "true";
  }
  return true;
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

function normalizeIds(raw: unknown[]): string[] {
  const out: string[] = [];
  for (const id of raw) {
    const s = String(id ?? "").trim();
    if (!s || s.length > 100) continue;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * ONE canonical target validation/normalization for the whole boundary
 * (preview, digest, outcomes, execution loop). Identical semantics everywhere:
 *   - non-array / empty / whitespace-only / non-string / >100-char IDs →
 *     invalid payload (400);
 *   - duplicate IDs → invalid payload (400) — a duplicate can never be
 *     executed twice because the payload is rejected outright;
 *   - valid IDs are returned in canonical sorted order — independent of the
 *     caller's presentation order — and are deduplicated by construction.
 */
export function validateBulkTargetIds(
  raw: unknown
): { ok: true; ids: string[] } | { ok: false; message: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, message: "Pasirinkite bent vieną skelbimą." };
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") {
      return { ok: false, message: "Neteisingas skelbimo identifikatorius." };
    }
    const s = entry.trim();
    if (!s) {
      return { ok: false, message: "Neteisingas skelbimo identifikatorius." };
    }
    if (s.length > 100) {
      return { ok: false, message: "Neteisingas skelbimo identifikatorius." };
    }
    if (seen.has(s)) {
      return { ok: false, message: "Pasikartojantis skelbimo identifikatorius." };
    }
    seen.add(s);
    ids.push(s);
  }
  return { ok: true, ids: [...ids].sort() };
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

/**
 * The immutable proposal image covered by the digest: EVERY requested target
 * with its verdict (owned/foreign/not_found/invalid), sorted canonically.
 * Adding, removing or changing any target changes the digest.
 */
function canonicalDigestPayload(input: {
  actorId: string;
  targets: Array<{ id: string; verdict: string }>;
  operation: BulkOperation;
  expiresAt: number;
}): string {
  const targets = [...input.targets]
    .map((t) => ({ id: t.id, verdict: t.verdict }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({
    actorId: input.actorId,
    targets,
    operation: input.operation,
    expiresAt: input.expiresAt,
  });
}

export function signBulkProposal(
  input: {
    actorId: string;
    targets: Array<{ id: string; verdict: string }>;
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
 * over the FULL proposal image, and surface every warning. No execution.
 */
export function buildBulkProposal(input: {
  actorId: string;
  listings: BulkListingRow[];
  requestedIds: unknown;
  operation: BulkOperation;
  signingKey: string;
  nowMs?: number;
}): { proposal: BulkProposal; digest: string } {
  const now = input.nowMs ?? Date.now();
  const expiresAt = now + BULK_PROPOSAL_TTL_MS;
  const validated = validateBulkTargetIds(input.requestedIds);
  if (!validated.ok) {
    return {
      proposal: {
        operation: input.operation,
        expiresAt,
        items: [],
        ownedCount: 0,
        warnings: [validated.message],
      },
      digest: "",
    };
  }
  const { verdicts, ownedIds } = classifyBulkTargets({
    actorId: input.actorId,
    listings: input.listings,
    requestedIds: validated.ids,
  });
  const warnings: string[] = [];
  for (const v of verdicts) {
    if (v.status === "foreign") warnings.push(`Svetimas skelbimas atmestas: ${v.listingId}`);
    if (v.status === "not_found") warnings.push(`Skelbimas nerastas: ${v.listingId}`);
    if (v.status === "invalid") warnings.push(`Skelbimas negalimas (uždraustas): ${v.listingId}`);
  }
  if (ownedIds.length === 0) warnings.push("Nėra patvirtinamų skelbimų.");
  return {
    proposal: {
      operation: input.operation,
      expiresAt,
      items: verdicts,
      ownedCount: ownedIds.length,
      warnings,
    },
    digest: signBulkProposal(
      {
        actorId: input.actorId,
        targets: verdicts.map((v) => ({ id: v.listingId, verdict: v.status })),
        operation: input.operation,
        expiresAt,
      },
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
  | {
      ok: false;
      code:
        | "expired"
        | "tampered"
        | "invalid_operation"
        | "unauthorized"
        | "empty_targets"
        | "too_many"
        | "invalid_payload"
        | "disabled"
        | "duplicate";
      message: string;
    };

/**
 * Execute a human-confirmed bulk operation. Fail-closed at every boundary:
 * gate, expiry, digest (full proposal image), role, fresh ownership,
 * idempotency. `executedKeys` is the caller's registry; the scoped key is
 * claimed BEFORE any item is applied so replays can never double-apply.
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
  env?: { NODE_ENV?: string; VAUTO_ENABLE_BULK_LISTING_OPS?: string };
}): Promise<BulkExecutionResult> {
  const now = input.nowMs ?? Date.now();
  const operation = input.operation as BulkOperation;
  if (!(BULK_OPERATIONS as readonly string[]).includes(operation)) {
    return { ok: false, code: "invalid_operation", message: "Nepalaikoma operacija." };
  }
  if (!canRunBulkOperations(input.actorRole)) {
    return { ok: false, code: "unauthorized", message: "Tik verslo pardavėjams." };
  }
  if (!bulkExecutionEnabled(input.env)) {
    return { ok: false, code: "disabled", message: "Bulk vykdymas išjungtas šioje aplinkoje." };
  }
  const validated = validateBulkTargetIds(input.targetIds);
  if (!validated.ok) {
    return { ok: false, code: "invalid_payload", message: validated.message };
  }
  if (validated.ids.length > BULK_MAX_TARGETS) {
    return { ok: false, code: "too_many", message: `Daugiausia ${BULK_MAX_TARGETS} skelbimų vienu metu.` };
  }
  const canonicalIds = validated.ids;
  const key = String(input.idempotencyKey ?? "").trim();
  if (!key || key.length > 160) {
    return { ok: false, code: "duplicate", message: "Trūksta idempotency rakto." };
  }
  if (input.proposalExpiresAt <= now) {
    return { ok: false, code: "expired", message: "Patvirtinimas pasibaigė — sukurkite naują preview." };
  }

  const listings = await input.resolveListings();
  const { verdicts, ownedIds, foreignIds } = classifyBulkTargets({
    actorId: input.actorId,
    listings,
    requestedIds: canonicalIds,
  });

  // The digest must match the FULL proposal image: any target added, removed
  // or changed (including its verdict) at confirm time fails closed.
  const expectedDigest = signBulkProposal(
    {
      actorId: input.actorId,
      targets: verdicts.map((v) => ({ id: v.listingId, verdict: v.status })),
      operation,
      expiresAt: input.proposalExpiresAt,
    },
    input.signingKey
  );
  if (!safeEqual(input.digest, expectedDigest)) {
    return { ok: false, code: "tampered", message: "Proposal pakeistas — atnaujinkite preview." };
  }

  const outcomes: BulkItemOutcome[] = [];
  const audit: BulkAuditEntry[] = [];
  const action = `bulk:${operation}`;
  // Idempotency is scoped to actor + operation + correlation key.
  const scopedKey = `${input.actorId}:${operation}:${key}`;
  const claimed = !input.executedKeys.has(scopedKey);
  if (!claimed) {
    for (const id of canonicalIds) {
      const reason = "duplicate_request";
      outcomes.push({ id, status: "skipped", reason });
      audit.push({ actorId: input.actorId, action, targetId: id, outcome: `skipped:${reason}`, correlation: key, timestamp: now });
    }
    return { ok: true, outcomes, audit, executed: false };
  }
  input.executedKeys.add(scopedKey);

  const foreignSet = new Set(foreignIds);
  const appliedIds = new Set<string>();
  for (const id of canonicalIds) {
    if (!ownedIds.includes(id)) {
      const reason = foreignSet.has(id) ? "not_owned" : "not_found";
      outcomes.push({ id, status: "failed", reason });
      audit.push({ actorId: input.actorId, action, targetId: id, outcome: `failed:${reason}`, correlation: key, timestamp: now });
      continue;
    }
    if (appliedIds.has(id)) continue; // defense-in-depth: applyItem at most once per canonical id
    appliedIds.add(id);
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
