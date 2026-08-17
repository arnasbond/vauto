import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** DDL for runMigrations() only. Observability must never call this. */
async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/**
 * Apply pending SQL files under server/migrations/.
 * Callers must catch errors — Render startup must keep the HTTP server up
 * even when a migrate fails (see index.ts).
 */
export async function runMigrations(): Promise<{ applied: string[] }> {
  await ensureMigrationsTable();

  const dir = join(__dirname, "../migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied: string[] = [];

  for (const file of files) {
    const { rows } = await pool.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations WHERE filename = $1",
      [file]
    );
    if (rows.length > 0) continue;

    const sql = readFileSync(join(dir, file), "utf8").replace(/^\uFEFF/, "");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [file]
      );
      await client.query("COMMIT");
      applied.push(file);
      console.log(`Migration applied: ${file}`);
    } catch (e) {
      await client.query("ROLLBACK");
      const detail = e instanceof Error ? e.message : String(e);
      console.error(`Migration FAILED: ${file} — ${detail}`);
      throw e;
    } finally {
      client.release();
    }
  }

  if (applied.length === 0) {
    console.log("[migrate] Schema up to date");
  } else {
    console.log(
      `[migrate] Applied ${applied.length} file(s): ${applied.join(", ")}`
    );
  }

  return { applied };
}

export type MigrationSchemaState =
  | "current"
  | "pending"
  | "not_initialized"
  | "unavailable";

export type MigrationStatus = {
  /** Observability state — never implied by HTTP 200 alone. */
  state: MigrationSchemaState;
  upToDate: boolean;
  expectedCount: number;
  appliedCount: number;
  latestApplied: string | null;
  pending: string[];
};

export type SqlQueryable = {
  query: (
    text: string,
    params?: unknown[]
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

const WRITE_SQL =
  /\b(create|alter|drop|insert|update|delete|truncate|grant|revoke|vacuum|reindex|copy)\b/i;

export function listExpectedMigrationFiles(): string[] {
  const dir = join(__dirname, "../migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function assertReadOnlySql(text: string): void {
  if (WRITE_SQL.test(text)) {
    throw new Error(`getMigrationStatus refused non-read-only SQL: ${text}`);
  }
}

function unavailableStatus(expectedCount: number): MigrationStatus {
  return {
    state: "unavailable",
    upToDate: false,
    expectedCount,
    appliedCount: 0,
    latestApplied: null,
    pending: [],
  };
}

/**
 * READ-ONLY schema_migrations vs on-disk files.
 * SELECT / information_schema only — never CREATE/ALTER/DROP/DML.
 * Missing table → not_initialized. Introspection failure → unavailable.
 * Used by /api/health. Must not create DB objects.
 */
export async function getMigrationStatus(
  db: SqlQueryable = pool
): Promise<MigrationStatus> {
  const expected = listExpectedMigrationFiles();
  try {
    const existsSql = `
      SELECT 1 AS present
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'schema_migrations'
      LIMIT 1
    `;
    assertReadOnlySql(existsSql);
    const exists = await db.query(existsSql);
    if (!exists.rows.length) {
      return {
        state: "not_initialized",
        upToDate: false,
        expectedCount: expected.length,
        appliedCount: 0,
        latestApplied: null,
        pending: expected,
      };
    }

    const appliedSql =
      "SELECT filename FROM schema_migrations ORDER BY filename";
    assertReadOnlySql(appliedSql);
    const { rows } = await db.query(appliedSql);
    const appliedNames = rows.map((r) => String(r.filename ?? ""));
    const applied = new Set(appliedNames);
    const pending = expected.filter((f) => !applied.has(f));
    const latestApplied = appliedNames.length
      ? appliedNames[appliedNames.length - 1]
      : null;
    const upToDate = pending.length === 0 && expected.length > 0;
    return {
      state: upToDate ? "current" : "pending",
      upToDate,
      expectedCount: expected.length,
      appliedCount: appliedNames.length,
      latestApplied,
      pending,
    };
  } catch {
    return unavailableStatus(expected.length);
  }
}

/** Public /api/health.schema shape — explicit state, never release-ready by omission. */
export function toPublicSchemaStatus(status: MigrationStatus): {
  state: MigrationSchemaState;
  upToDate: boolean;
  expectedCount: number;
  appliedCount: number;
  latestApplied: string | null;
  pendingCount: number;
  pending: string[];
} {
  return {
    state: status.state,
    upToDate: status.upToDate === true && status.state === "current",
    expectedCount: status.expectedCount,
    appliedCount: status.appliedCount,
    latestApplied: status.latestApplied,
    pendingCount: status.pending.length,
    pending: status.pending.slice(0, 32),
  };
}
