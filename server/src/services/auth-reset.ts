import { pool } from "../db.js";
import { DEMO_LISTINGS, DEMO_USER } from "../demo-listings.js";
import { clearAllOtps, getOtpStoreSize } from "./otp.js";

export interface AuthResetOptions {
  /** When true, only report what would be deleted. */
  dryRun?: boolean;
  /** Keep catalog demo sellers and DEMO_USER (default true). */
  preserveCatalog?: boolean;
  /** Keep admin-1 row if present (default false for clean launch). */
  preserveAdmin?: boolean;
}

export interface AuthResetResult {
  ok: boolean;
  dryRun: boolean;
  otpEntriesCleared: number;
  usersDeleted: number;
  orphansCleared: number;
  preservedUserIds: string[];
  deletedUserIds: string[];
  usersRemaining: number;
  authUsersRemaining: number;
  note: string;
}

function collectCatalogUserIds(): Set<string> {
  const ids = new Set<string>([DEMO_USER.id]);
  for (const listing of DEMO_LISTINGS) {
    ids.add(listing.seller_id);
  }
  return ids;
}

async function listAuthUserIds(): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM users
     WHERE auth_provider IS NOT NULL
        OR id LIKE 'user-%'
        OR id = 'admin-1'`
  );
  return rows.map((r) => r.id);
}

export async function getAuthHygieneSnapshot(): Promise<{
  totalUsers: number;
  authUsers: number;
  otpEntries: number;
  byProvider: Record<string, number>;
  staleRoleUsers: number;
}> {
  const total = await pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM users"
  );
  const byProviderRows = await pool.query<{ auth_provider: string | null; count: string }>(
    `SELECT auth_provider, count(*)::text AS count
     FROM users
     GROUP BY auth_provider`
  );
  const staleRoles = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM users
     WHERE role IN ('admin', 'super_admin')
       AND id NOT IN ('admin-1')`
  );
  const authCount = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM users
     WHERE auth_provider IS NOT NULL OR id LIKE 'user-%' OR id = 'admin-1'`
  );

  const byProvider: Record<string, number> = {};
  for (const row of byProviderRows.rows) {
    byProvider[row.auth_provider ?? "unknown"] = Number(row.count);
  }

  return {
    totalUsers: Number(total.rows[0]?.count ?? 0),
    authUsers: Number(authCount.rows[0]?.count ?? 0),
    otpEntries: getOtpStoreSize(),
    byProvider,
    staleRoleUsers: Number(staleRoles.rows[0]?.count ?? 0),
  };
}

/** Remove test/OAuth users while preserving catalog sellers. Clears in-memory OTP. */
export async function resetAuthState(
  options: AuthResetOptions = {}
): Promise<AuthResetResult> {
  const dryRun = options.dryRun === true;
  const preserveCatalog = options.preserveCatalog !== false;
  const preserveAdmin = options.preserveAdmin === true;

  const preserve = new Set<string>();
  if (preserveCatalog) {
    for (const id of collectCatalogUserIds()) preserve.add(id);
  }
  if (preserveAdmin) preserve.add("admin-1");

  const candidateIds = await listAuthUserIds();
  const toDelete = candidateIds.filter((id) => !preserve.has(id));

  let orphansCleared = 0;
  if (toDelete.length > 0 && !dryRun) {
    const orphanReports = await pool.query(
      `DELETE FROM support_reports
       WHERE reporter_id = ANY($1::text[]) OR reported_user_id = ANY($1::text[])`,
      [toDelete]
    );
    const orphanNegotiation = await pool.query(
      `DELETE FROM negotiation_audit_log WHERE seller_user_id = ANY($1::text[])`,
      [toDelete]
    );
    orphansCleared =
      (orphanReports.rowCount ?? 0) + (orphanNegotiation.rowCount ?? 0);

    await pool.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [toDelete]);
  }

  const otpEntriesCleared = dryRun ? getOtpStoreSize() : clearAllOtps();

  const remaining = await pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM users"
  );
  const authRemaining = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM users
     WHERE auth_provider IS NOT NULL OR id LIKE 'user-%' OR id = 'admin-1'`
  );

  return {
    ok: true,
    dryRun,
    otpEntriesCleared,
    usersDeleted: dryRun ? 0 : toDelete.length,
    orphansCleared,
    preservedUserIds: [...preserve],
    deletedUserIds: dryRun ? toDelete : toDelete,
    usersRemaining: Number(remaining.rows[0]?.count ?? 0),
    authUsersRemaining: Number(authRemaining.rows[0]?.count ?? 0),
    note:
      "JWT sessions are stateless — rotate JWT_SECRET on Render to invalidate all outstanding tokens immediately.",
  };
}
