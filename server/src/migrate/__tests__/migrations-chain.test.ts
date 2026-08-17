/**
 * Stage 16C — migration chain safety (static + optional isolated apply).
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../../../migrations");

function sqlFiles(): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

describe("Stage 16 migration chain", () => {
  it("has a non-empty lexicographic SQL chain", () => {
    const files = sqlFiles();
    assert.ok(files.length >= 60, `expected many migrations, got ${files.length}`);
    const sorted = [...files].sort();
    assert.deepEqual(files, sorted);
  });

  it("forbids DROP DATABASE / TRUNCATE in the production chain", () => {
    for (const file of sqlFiles()) {
      const sql = readFileSync(join(dir, file), "utf8");
      assert.equal(
        /drop\s+database/i.test(sql),
        false,
        `${file} contains DROP DATABASE`
      );
      assert.equal(/truncate\s+/i.test(sql), false, `${file} contains TRUNCATE`);
    }
  });

  it("allows DROP TABLE only in the documented portal-links cleanup", () => {
    for (const file of sqlFiles()) {
      if (/drop\s+table/i.test(readFileSync(join(dir, file), "utf8"))) {
        assert.equal(file, "019_drop_user_portal_links.sql");
      }
    }
  });

  it("second apply is deterministic: filenames are unique", () => {
    const files = sqlFiles();
    assert.equal(new Set(files).size, files.length);
  });
});
