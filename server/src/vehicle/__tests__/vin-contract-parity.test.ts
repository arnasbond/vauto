import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyVinExtractionCandidate,
  applyVinManualEntryCandidate,
  applyVinStructuredReviewAction,
  confirmVin,
  deriveVinReviewState,
} from "../vin-review.js";

/**
 * Phase 2C — client/server contract parity (REQUIRED 30).
 *
 * The SINGLE authoritative implementation lives at repo-root `shared/vin-review.ts`
 * (+ `shared/vin-utils.ts`, `shared/listing-attributes-sanitize.ts`); the client
 * imports them directly via `@vauto/shared/*`. The server uses the committed
 * mirrors at `server/src/shared/*` (server tsc rootDir cannot reach outside
 * `server/src/`, matching the existing marketplace-domain mirror pattern).
 *
 * Import-specifier normalization: the repo-root modules are compiled by Next/Webpack
 * (bundler resolution), so their relative imports are EXTENSIONLESS; the server
 * mirrors run under NodeNext and must carry the `.js` suffix. This suffix is the
 * ONLY allowed difference between a root module and its server mirror. The
 * `normalizeNodeNextImports` transform below rewrites the known extensionless
 * relative imports to their `.js` form before the byte-identity comparison —
 * any OTHER divergence (logic, markers, keys, behavior) still fails the test.
 *
 * This test enforces the mirror CANNOT drift:
 *  1. byte-identity modulo the documented import-suffix transform (after
 *     CRLF→LF normalization), so both trees execute identical logic; and
 *  2. a deterministic scenario matrix run against the server module proves the
 *     reducer behavior the client will see.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../../");

function lfNormalized(file: string): string {
  return readFileSync(file, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Rewrite the ROOT (bundler-resolution) module into its NodeNext-equivalent form:
 * known extensionless relative imports gain `.js`. Restricted to the exact
 * relative-import rewrite — every other byte must stay identical.
 */
function normalizeNodeNextImports(source: string): string {
  return source
    .replace(/from "(\.[^"]+)";/g, (_m, spec) =>
      spec.endsWith(".js") || spec.endsWith(".json")
        ? `from "${spec}";`
        : `from "${spec}.js";`
    )
    .replace(/from '(\.[^']+)';/g, (_m, spec) =>
      spec.endsWith(".js") || spec.endsWith(".json")
        ? `from '${spec}';`
        : `from '${spec}.js';`
    );
}

describe("Phase 2C contract parity — enforced no-drift mirror", () => {
  for (const name of ["vin-review.ts", "vin-utils.ts", "listing-attributes-sanitize.ts", "fact-evidence.ts", "fact-evidence-adapter.ts", "llm-context-slice.ts"]) {
    test(`shared/${name} and server/src/shared/${name} are identical modulo the NodeNext import-suffix transform`, () => {
      const root = lfNormalized(join(repoRoot, "shared", name));
      const mirror = lfNormalized(join(repoRoot, "server", "src", "shared", name));
      assert.equal(
        mirror,
        normalizeNodeNextImports(root),
        `${name} mirror drifted from the authoritative root copy (allowed difference: extensionless → .js import suffix only)`
      );
    });
  }
});

const VALID_A = "WBAZZZ8VZM1234567";
const VALID_B = "VF3XXXXXXXXX99999";

describe("Phase 2C contract parity — deterministic scenario matrix (server mirror == client module)", () => {
  test("photo candidate → confirmed → publish-readable canonical; client reducer path is identical", () => {
    const attrs = applyVinExtractionCandidate(
      {},
      { value: VALID_A, source: "photo_ocr", confidence: 0.9 }
    );
    assert.equal(deriveVinReviewState(attrs).status, "candidate");
    assert.equal(attrs.vin, undefined);
    const confirmed = confirmVin(attrs, {
      type: "confirm",
      value: VALID_A,
      reviewId: attrs.vinReviewId ?? "",
    });
    assert.equal(confirmed.outcome, "applied");
    assert.equal(confirmed.attrs.vin, VALID_A);
  });

  test("manual typing → candidate with fresh generation → stale confirm of the older generation is a no-op", () => {
    const typed = applyVinManualEntryCandidate({}, VALID_A, "user_entered");
    assert.ok(typed.vinReviewId);
    const edited = applyVinManualEntryCandidate(typed, VALID_B, "user_entered");
    assert.notEqual(edited.vinReviewId, typed.vinReviewId);
    const stale = applyVinStructuredReviewAction(edited, {
      type: "confirm",
      value: VALID_A,
      reviewId: typed.vinReviewId ?? "",
    });
    assert.equal(stale.outcome, "stale_review");
    assert.equal(stale.attrs.vin, undefined);
  });

  test("conflict matrix: photo A + document B → conflict; confirm B → canonical B", () => {
    const a = applyVinExtractionCandidate({}, { value: VALID_A, source: "photo_ocr" });
    const conflicted = applyVinExtractionCandidate(a, { value: VALID_B, source: "document_ocr" });
    assert.equal(deriveVinReviewState(conflicted).status, "conflict");
    const resolved = applyVinStructuredReviewAction(conflicted, {
      type: "confirm",
      value: VALID_B,
      reviewId: conflicted.vinReviewId ?? "",
    });
    assert.equal(resolved.outcome, "applied");
    assert.equal(resolved.attrs.vin, VALID_B);
  });
});
