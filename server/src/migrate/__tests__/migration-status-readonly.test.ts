/**
 * Stage 16R.1 — getMigrationStatus must be SELECT/introspection only.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  getMigrationStatus,
  listExpectedMigrationFiles,
  toPublicSchemaStatus,
  type SqlQueryable,
} from "../../migrate.js";

const WRITE_SQL =
  /\b(create|alter|drop|insert|update|delete|truncate|grant|revoke)\b/i;

const migrateSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../migrate.ts"),
  "utf8"
);

function createFakeDb(opts: {
  tableExists: boolean;
  applied?: string[];
  fail?: boolean;
}) {
  const executed: string[] = [];
  const db: SqlQueryable & { executed: string[] } = {
    executed,
    async query(text: string) {
      executed.push(text);
      if (opts.fail) throw new Error("injected introspection failure");
      if (/information_schema\.tables/i.test(text)) {
        return { rows: opts.tableExists ? [{ present: 1 }] : [] };
      }
      if (/from\s+schema_migrations/i.test(text)) {
        assert.equal(
          opts.tableExists,
          true,
          "must not SELECT schema_migrations when table is missing"
        );
        return {
          rows: (opts.applied ?? []).map((filename) => ({ filename })),
        };
      }
      throw new Error(`unexpected SQL: ${text}`);
    },
  };
  return db;
}

describe("16R.1 getMigrationStatus is SELECT-only", () => {
  it("RAW: ensureMigrationsTable performs CREATE TABLE IF NOT EXISTS DDL", () => {
    assert.match(
      migrateSrc,
      /async function ensureMigrationsTable[\s\S]*CREATE TABLE IF NOT EXISTS schema_migrations/
    );
  });

  it("RAW: getMigrationStatus no longer calls ensureMigrationsTable", () => {
    const start = migrateSrc.indexOf(
      "export async function getMigrationStatus"
    );
    assert.ok(start >= 0);
    const body = migrateSrc.slice(start);
    assert.equal(body.includes("ensureMigrationsTable"), false);
    assert.equal(/CREATE TABLE/i.test(body), false);
  });

  it("does not execute CREATE/ALTER/DROP/INSERT/UPDATE/DELETE", async () => {
    const db = createFakeDb({
      tableExists: true,
      applied: listExpectedMigrationFiles(),
    });
    await getMigrationStatus(db);
    for (const sql of db.executed) {
      assert.equal(WRITE_SQL.test(sql), false, sql);
    }
  });

  it("detects pending migrations without writing", async () => {
    const expected = listExpectedMigrationFiles();
    const applied = expected.slice(0, Math.max(1, expected.length - 3));
    const db = createFakeDb({ tableExists: true, applied });
    const status = await getMigrationStatus(db);
    assert.equal(status.state, "pending");
    assert.equal(status.upToDate, false);
    assert.deepEqual(status.pending, expected.slice(applied.length));
    assert.equal(status.appliedCount, applied.length);
    for (const sql of db.executed) {
      assert.equal(WRITE_SQL.test(sql), false, sql);
    }
  });

  it("returns not_initialized when schema_migrations does not exist", async () => {
    const db = createFakeDb({ tableExists: false });
    const status = await getMigrationStatus(db);
    assert.equal(status.state, "not_initialized");
    assert.equal(status.upToDate, false);
    assert.equal(status.appliedCount, 0);
    assert.deepEqual(status.pending, listExpectedMigrationFiles());
    assert.equal(
      db.executed.some((s) => /from\s+schema_migrations/i.test(s)),
      false
    );
  });

  it("returns unavailable on introspection failure and does not mutate DB", async () => {
    const db = createFakeDb({ tableExists: true, fail: true });
    const before = [...db.executed];
    const status = await getMigrationStatus(db);
    assert.equal(status.state, "unavailable");
    assert.equal(status.upToDate, false);
    assert.deepEqual(status.pending, []);
    assert.equal(toPublicSchemaStatus(status).upToDate, false);
    assert.deepEqual(db.executed.slice(0, before.length), before);
    for (const sql of db.executed) {
      assert.equal(WRITE_SQL.test(sql), false, sql);
    }
  });

  it("maps current vs pending vs unavailable for /api/health without hiding state", async () => {
    const expected = listExpectedMigrationFiles();
    const current = await getMigrationStatus(
      createFakeDb({ tableExists: true, applied: expected })
    );
    assert.equal(current.state, "current");
    assert.equal(toPublicSchemaStatus(current).upToDate, true);
    assert.equal(toPublicSchemaStatus(current).state, "current");

    const pending = await getMigrationStatus(
      createFakeDb({ tableExists: true, applied: expected.slice(0, 2) })
    );
    assert.equal(pending.state, "pending");
    assert.equal(toPublicSchemaStatus(pending).upToDate, false);

    const missing = await getMigrationStatus(
      createFakeDb({ tableExists: false })
    );
    assert.equal(missing.state, "not_initialized");
    assert.equal(toPublicSchemaStatus(missing).upToDate, false);

    const down = toPublicSchemaStatus({
      state: "unavailable",
      upToDate: false,
      expectedCount: 0,
      appliedCount: 0,
      latestApplied: null,
      pending: [],
    });
    assert.equal(down.state, "unavailable");
    assert.equal(down.upToDate, false);
  });
});
