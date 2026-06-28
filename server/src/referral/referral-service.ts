import { query } from "../db.js";
import type { ApiUser } from "../types.js";

const CODE_PREFIX = "VAUTO";

export function generateReferralCode(userId: string): string {
  const hash = userId
    .split("")
    .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const suffix = hash.toString(36).toUpperCase().slice(-5).padStart(5, "0");
  return `${CODE_PREFIX}-${suffix}`;
}

export async function ensureUserReferralCode(userId: string): Promise<string> {
  const rows = await query<{ referral_code: string | null }>(
    `SELECT referral_code FROM users WHERE id = $1`,
    [userId]
  );
  const existing = rows[0]?.referral_code;
  if (existing) return existing;

  let code = generateReferralCode(userId);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await query(
        `UPDATE users SET referral_code = $2, updated_at = now() WHERE id = $1`,
        [userId, code]
      );
      return code;
    } catch {
      code = `${CODE_PREFIX}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    }
  }
  return code;
}

export async function resolveReferralCode(
  code: string
): Promise<string | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const rows = await query<{ id: string }>(
    `SELECT id FROM users WHERE UPPER(referral_code) = $1 OR id = $2 LIMIT 1`,
    [normalized, code.trim()]
  );
  return rows[0]?.id ?? null;
}

export async function applyReferralOnSignup(
  newUserId: string,
  referrerCode: string
): Promise<void> {
  const referrerId = await resolveReferralCode(referrerCode);
  if (!referrerId || referrerId === newUserId) return;

  await query(
    `UPDATE users SET referred_by_user_id = $2, updated_at = now()
     WHERE id = $1 AND referred_by_user_id IS NULL`,
    [newUserId, referrerId]
  );
  await grantProtectionCredits(referrerId, 1);
  await grantProtectionCredits(newUserId, 1);
}

export async function getFreeProtectionCredits(userId: string): Promise<number> {
  const rows = await query<{ free_protection_credits: number }>(
    `SELECT free_protection_credits FROM users WHERE id = $1`,
    [userId]
  );
  return rows[0]?.free_protection_credits ?? 0;
}

export async function grantProtectionCredits(
  userId: string,
  count: number
): Promise<void> {
  if (count <= 0) return;
  await query(
    `UPDATE users SET free_protection_credits = free_protection_credits + $2, updated_at = now()
     WHERE id = $1`,
    [userId, count]
  );
}

export async function consumeProtectionCredit(userId: string): Promise<boolean> {
  const rows = await query<{ free_protection_credits: number }>(
    `UPDATE users SET free_protection_credits = GREATEST(0, free_protection_credits - 1), updated_at = now()
     WHERE id = $1 AND free_protection_credits > 0
     RETURNING free_protection_credits`,
    [userId]
  );
  return rows.length > 0;
}

/** Sėkmingo escrow sandorio metu — abiem vartotojams po 1 nemokamą apsaugos kreditą. */
export async function applyReferralEscrowRewards(opts: {
  buyerId: string;
  sellerId: string;
}): Promise<void> {
  const buyerRows = await query<{ referred_by_user_id: string | null }>(
    `SELECT referred_by_user_id FROM users WHERE id = $1`,
    [opts.buyerId]
  );
  const referredBy = buyerRows[0]?.referred_by_user_id;

  await grantProtectionCredits(opts.buyerId, 1);
  await grantProtectionCredits(opts.sellerId, 1);

  if (referredBy && referredBy !== opts.buyerId) {
    await grantProtectionCredits(referredBy, 1);
  }
}

export async function attachReferralFields(user: ApiUser): Promise<ApiUser> {
  const code = await ensureUserReferralCode(user.id);
  const credits = await getFreeProtectionCredits(user.id);
  return { ...user, referralCode: code, freeProtectionCredits: credits };
}
