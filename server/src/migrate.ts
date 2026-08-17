import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

export type MigrationStatus = {
  upToDate: boolean;
  expectedCount: number;
  appliedCount: number;
  latestApplied: string | null;
  pending: string[];
};

/**
 * READ-ONLY schema_migrations vs on-disk files. Does not apply SQL.
 * Used by /api/health and scripts/check-schema-migrations.mjs.
 */
export async function getMigrationStatus(): Promise<MigrationStatus> {
  const dir = join(__dirname, "../migrations");
  const expected = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  await ensureMigrationsTable();
  const { rows } = await pool.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations ORDER BY filename"
  );
  const applied = new Set(rows.map((r) => r.filename));
  const pending = expected.filter((f) => !applied.has(f));
  const latestApplied = rows.length ? rows[rows.length - 1].filename : null;
  return {
    upToDate: pending.length === 0 && expected.length > 0,
    expectedCount: expected.length,
    appliedCount: rows.length,
    latestApplied,
    pending,
  };
}
