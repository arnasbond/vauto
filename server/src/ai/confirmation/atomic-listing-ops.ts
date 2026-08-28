/**
 * VAUTO AI Maturity — Phase 1: Consequential Action Confirmation Boundary.
 * 3rd audit remediation — genuinely atomic, idempotent domain mutations for
 * markListingSold / blockListing.
 *
 * The fencing token in consequential-action-policy.ts guarantees exactly one
 * caller can ever WRITE THE BOOKKEEPING ROW's terminal state — it says
 * nothing about the domain mutation itself. If two executors' `execute()`
 * calls genuinely overlap (e.g. the original slow-but-alive executor and a
 * crash-recovery reclaim, both mid-flight at once), the DOMAIN mutation must
 * independently be safe to run twice. These two functions are that
 * guarantee: a single conditional `UPDATE ... WHERE ... RETURNING` (the same
 * single-statement CAS pattern as `tryClaim` above and
 * `PaymentRepository.tryAcquireTransferExecutionLock`) wrapped in one
 * transaction via `runQueryableTransaction` (server/src/transaction/tx-connection.ts):
 *
 *   - `markListingSoldAtomic`: transitions listings.status non-sold -> 'sold'
 *     for the EXACT listing owned by the authenticated seller, and
 *     increments users.sold_count, IN ONE TRANSACTION. Two overlapping
 *     callers can never both see a matching UPDATE — Postgres's own
 *     row-level write serialization means at most one UPDATE ... RETURNING
 *     ever returns a row for a given (listingId) transition, so sold_count
 *     is incremented by exactly the caller that performed the real
 *     transition, never twice.
 *   - `setListingBannedAtomic`: transitions listings.banned false -> true
 *     with the same single-statement CAS. The caller MUST only
 *     enqueue/send the moderation notification when `alreadyDone` is
 *     false — that is the only signal that THIS call performed the real
 *     transition (see routes/consequential-actions.ts executeBlockListing).
 *
 * Deliberately narrow: reads/writes ONLY the columns these two actions need
 * (never the full listings/users repository surface) and is NEVER wired
 * into any financial/transaction path — see module docblock in
 * consequential-action-policy.ts.
 */

import {
  runQueryableTransaction,
  type Queryable,
} from "../../transaction/tx-connection.js";

export interface AtomicMarkSoldResult {
  ok: true;
  listingId: string;
  title: string;
  /** True when this listing was ALREADY sold by this same seller — no counter increment happened on this call. */
  alreadyDone: boolean;
}

/**
 * Returns `null` when the listing does not exist, or exists but is not
 * owned by `sellerId` (ownership is re-checked as part of the same atomic
 * decision — never a separate round trip that could race).
 */
export async function markListingSoldAtomic(
  db: Queryable,
  listingId: string,
  sellerId: string
): Promise<AtomicMarkSoldResult | null> {
  return runQueryableTransaction(db, async (tx) => {
    const claimed = await tx.query<{ id: string; title: string }>(
      `UPDATE listings
         SET status = 'sold'
       WHERE id = $1
         AND seller_id = $2
         AND COALESCE(status, 'active') <> 'sold'
       RETURNING id, title`,
      [listingId, sellerId]
    );
    if (claimed.rows[0]) {
      // Only the caller that just performed the REAL transition reaches
      // this branch — the increment can never happen twice for the same
      // sale, because the UPDATE above matches at most once per listing.
      await tx.query(
        `UPDATE users SET sold_count = sold_count + 1, updated_at = NOW() WHERE id = $1`,
        [sellerId]
      );
      return { ok: true, listingId, title: claimed.rows[0].title, alreadyDone: false };
    }

    // Not transitioned by THIS call — either already sold (idempotent
    // replay/reclaim), or the listing is not owned by this seller.
    const current = await tx.query<{
      seller_id: string | null;
      title: string;
      status: string | null;
    }>(`SELECT seller_id, title, status FROM listings WHERE id = $1`, [listingId]);
    const row = current.rows[0];
    if (!row || row.seller_id !== sellerId) return null;
    return { ok: true, listingId, title: row.title, alreadyDone: true };
  });
}

export interface AtomicBanResult {
  ok: true;
  listingId: string;
  title: string;
  /** True when the listing was ALREADY banned — the caller MUST NOT notify again. */
  alreadyDone: boolean;
}

/** Returns `null` when the listing does not exist. */
export async function setListingBannedAtomic(
  db: Queryable,
  listingId: string
): Promise<AtomicBanResult | null> {
  return runQueryableTransaction(db, async (tx) => {
    const claimed = await tx.query<{ id: string; title: string }>(
      `UPDATE listings
         SET banned = true
       WHERE id = $1
         AND COALESCE(banned, false) = false
       RETURNING id, title`,
      [listingId]
    );
    if (claimed.rows[0]) {
      return { ok: true, listingId, title: claimed.rows[0].title, alreadyDone: false };
    }

    const current = await tx.query<{ title: string }>(
      `SELECT title FROM listings WHERE id = $1`,
      [listingId]
    );
    const row = current.rows[0];
    if (!row) return null;
    return { ok: true, listingId, title: row.title, alreadyDone: true };
  });
}
