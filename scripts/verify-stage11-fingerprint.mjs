// Stage 11 frozen-boundary fingerprint verifier.
//
// Compares every file listed in docs/checkpoints/stage11-frozen-baseline.txt
// against the current worktree. Hashing is newline-normalized (CR bytes
// stripped before hashing) because this Windows worktree runs with
// core.autocrlf=true, which rewrites tracked text files to CRLF on checkout.
// The frozen baseline was captured with LF line endings; without
// normalization every file would show as CHANGED purely due to line-ending
// translation, which is not a real content change. `git diff` against HEAD
// confirms zero real changes for all 89 files (autocrlf is a working-tree
// checkout detail, not a committed-content diff).
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const BASELINE_PATH = path.resolve("docs/checkpoints/stage11-frozen-baseline.txt");

function lfNormalizedSha256(filePath) {
  const buf = readFileSync(filePath);
  const noCr = Buffer.from(buf.filter((b) => b !== 0x0d));
  return createHash("sha256").update(noCr).digest("hex");
}

function main() {
  const lines = readFileSync(BASELINE_PATH, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let same = 0;
  let changed = 0;
  let missing = 0;
  const changedFiles = [];
  const missingFiles = [];

  for (const line of lines) {
    const idx = line.indexOf(" ");
    const expected = line.slice(0, idx).toLowerCase();
    const filePath = line.slice(idx).trim();
    if (!existsSync(filePath)) {
      missing++;
      missingFiles.push(filePath);
      continue;
    }
    const actual = lfNormalizedSha256(filePath);
    if (actual === expected) {
      same++;
    } else {
      changed++;
      changedFiles.push(filePath);
    }
  }

  console.log(`SAME: ${same}`);
  console.log(`CHANGED: ${changed}`);
  console.log(`MISSING: ${missing}`);
  if (changedFiles.length) {
    console.log("CHANGED FILES:");
    changedFiles.forEach((f) => console.log(`  ${f}`));
  }
  if (missingFiles.length) {
    console.log("MISSING FILES:");
    missingFiles.forEach((f) => console.log(`  ${f}`));
  }

  if (changed > 0 || missing > 0) {
    process.exitCode = 1;
  }
}

main();
