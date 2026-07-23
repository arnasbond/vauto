/**
 * Cursor-style credit / entitlement meter foundation.
 * Wallet EUR promote remains in wallet_transactions; this ledger tracks
 * metered AI / feature units per user for plan gates.
 */

import { query } from "../db.js";

export type CreditKind =
  | "ai_vision"
  | "ai_agent"
  | "ai_twin"
  | "grant"
  | "refund"
  | "adjust";

export interface CreditBalanceRow {
  userId: string;
  balance: number;
  updatedAt: string;
}

/** Ensure ledger tables exist (idempotent — safe on boot / first debit). */
export async function ensureCreditLedgerSchema(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS user_credits (
      user_id    TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
      balance    INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS credit_transactions (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      amount      INTEGER NOT NULL,
      kind        TEXT NOT NULL,
      meta        JSONB NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transactions (user_id, created_at DESC)`
  );
}

export async function getCreditBalance(userId: string): Promise<number> {
  await ensureCreditLedgerSchema();
  const rows = await query<{ balance: string | number }>(
    `SELECT balance FROM user_credits WHERE user_id = $1`,
    [userId]
  );
  return Number(rows[0]?.balance ?? 0);
}

/**
 * Grant credits (plan refill / promo). Never negative.
 */
export async function grantCredits(input: {
  userId: string;
  amount: number;
  kind?: CreditKind;
  meta?: Record<string, unknown>;
}): Promise<number> {
  const amount = Math.max(0, Math.floor(input.amount));
  if (!amount) return getCreditBalance(input.userId);
  await ensureCreditLedgerSchema();
  const txId = `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await query(
    `INSERT INTO user_credits (user_id, balance, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET
       balance = user_credits.balance + EXCLUDED.balance,
       updated_at = now()`,
    [input.userId, amount]
  );
  await query(
    `INSERT INTO credit_transactions (id, user_id, amount, kind, meta)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      txId,
      input.userId,
      amount,
      input.kind ?? "grant",
      JSON.stringify(input.meta ?? {}),
    ]
  );
  return getCreditBalance(input.userId);
}

/**
 * Debit credits for a metered action. Returns null if insufficient.
 */
export async function debitCredits(input: {
  userId: string;
  amount: number;
  kind: CreditKind;
  meta?: Record<string, unknown>;
}): Promise<number | null> {
  const amount = Math.max(0, Math.floor(input.amount));
  if (!amount) return getCreditBalance(input.userId);
  await ensureCreditLedgerSchema();
  const rows = await query<{ balance: string | number }>(
    `UPDATE user_credits SET balance = balance - $2, updated_at = now()
     WHERE user_id = $1 AND balance >= $2
     RETURNING balance`,
    [input.userId, amount]
  );
  if (!rows[0]) return null;
  const txId = `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await query(
    `INSERT INTO credit_transactions (id, user_id, amount, kind, meta)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      txId,
      input.userId,
      -amount,
      input.kind,
      JSON.stringify(input.meta ?? {}),
    ]
  );
  return Number(rows[0].balance);
}

/** Plan entitlement stubs — expand when Stripe plan IDs are unified. */
export function monthlyAiCreditGrantForPlan(planId: string | null | undefined): number {
  const p = String(planId ?? "free").toLowerCase();
  if (p === "enterprise" || p === "pro") return 500;
  if (p === "growth" || p === "starter" || p === "start") return 150;
  return 40;
}
