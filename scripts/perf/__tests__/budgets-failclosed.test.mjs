/**
 * F8 — fail-closed performance budget gates (pure unit tests).
 *
 * Every case below deliberately feeds MISSING or CORRUPT evidence and must
 * prove FAIL (failures > 0). The valid fixture (mirroring the real
 * measurement shape) must stay PASS, and the CLI must exit non-zero on
 * corrupt input.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkBudgets, REQUIRED_SCENARIOS } from "../budgets-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, "..", "check-perf-budgets.mjs");

const BASELINE = {
  results: Object.fromEntries(
    REQUIRED_SCENARIOS.map((id) => [
      id,
      {
        lcp: 9000,
        cls: 0.01,
        imgBytes: id.startsWith("home") ? 298_424 : 0,
        imgCount: 8,
        jsBytes: 700_000,
      },
    ])
  ),
};

function validAfter() {
  return {
    generatedAt: "2026-09-03T00:00:00.000Z",
    runs: 3,
    results: Object.fromEntries(
      REQUIRED_SCENARIOS.map((id) => {
        const isDesktop = id.includes("1440");
        const lcp = isDesktop ? 1000 : 6000;
        return [
          id,
          {
            path: id,
            mediaRequired: true,
            runs: [
              { loadMs: 1000, lcp, cls: 0, imgBytes: 100_000, imgCount: 8, jsBytes: 700_000 },
              { loadMs: 1001, lcp, cls: 0, imgBytes: 100_000, imgCount: 8, jsBytes: 700_000 },
              { loadMs: 1002, lcp, cls: 0, imgBytes: 100_000, imgCount: 8, jsBytes: 700_000 },
            ],
            median: {
              loadMs: 1000,
              lcp,
              lcpElement: "IMG.hero",
              cls: 0,
              imgBytes: 100_000,
              imgCount: 8,
              jsBytes: 700_000,
              jsCount: 12,
              reqCount: 40,
            },
          },
        ];
      })
    ),
  };
}

const clone = (v) => JSON.parse(JSON.stringify(v));

function expectFail(label, mutateBaseline, mutateAfter) {
  const baseline = clone(BASELINE);
  const after = validAfter();
  mutateBaseline?.(baseline);
  mutateAfter?.(after);
  const { failures } = checkBudgets(baseline, after, { log() {}, error() {}, warn() {} });
  assert.ok(failures > 0, `${label}: expected FAIL (failures > 0), got ${failures}`);
}

test("valid data stays PASS", () => {
  const { failures, warnings } = checkBudgets(
    clone(BASELINE),
    validAfter(),
    { log() {}, error() {}, warn() {} }
  );
  assert.equal(failures, 0);
  // 4 mobile LCP warnings expected at 6000ms (> 5000ms target).
  assert.equal(warnings, 4);
});

test("FAIL: missing required scenario", () => {
  expectFail("missing scenario", null, (a) => {
    delete a.results["search-390-slow4g"];
  });
});

test("FAIL: missing median structure", () => {
  expectFail("missing median", null, (a) => {
    delete a.results["home-1440"].median;
  });
});

test("FAIL: missing metric key", () => {
  expectFail("missing imgCount key", null, (a) => {
    delete a.results["home-390-slow4g"].median.imgCount;
  });
});

test("FAIL: non-number metric", () => {
  expectFail("string lcp", null, (a) => {
    a.results["home-390-slow4g"].median.lcp = "7312";
  });
});

test("FAIL: NaN metric", () => {
  expectFail("NaN cls", null, (a) => {
    a.results["home-390-slow4g"].median.cls = NaN;
  });
});

test("FAIL: Infinity metric", () => {
  expectFail("Infinity jsBytes", null, (a) => {
    a.results["home-390-slow4g"].median.jsBytes = Infinity;
  });
});

test("FAIL: negative metric", () => {
  expectFail("negative imgBytes", null, (a) => {
    a.results["home-390-slow4g"].median.imgBytes = -5;
  });
});

test("FAIL: semantically impossible lcp = 0", () => {
  expectFail("lcp 0", null, (a) => {
    a.results["home-390-slow4g"].median.lcp = 0;
  });
});

test("FAIL: semantically impossible jsBytes = 0", () => {
  expectFail("jsBytes 0", null, (a) => {
    a.results["home-390-slow4g"].median.jsBytes = 0;
  });
});

test("FAIL: media scenario with imgBytes <= 0", () => {
  expectFail("media imgBytes 0", null, (a) => {
    a.results["detail-390-slow4g"].median.imgBytes = 0;
  });
});

test("FAIL: media scenario with imgCount <= 0", () => {
  expectFail("media imgCount 0", null, (a) => {
    a.results["detail-390-slow4g"].median.imgCount = 0;
  });
});

test("FAIL: missing lcpElement attribution", () => {
  expectFail("missing lcpElement", null, (a) => {
    a.results["home-390-slow4g"].median.lcpElement = null;
  });
  expectFail("empty lcpElement", null, (a) => {
    a.results["home-390-slow4g"].median.lcpElement = "  ";
  });
});

test("FAIL: runs array missing or empty", () => {
  expectFail("runs missing", null, (a) => {
    delete a.results["home-390-slow4g"].runs;
  });
  expectFail("runs empty", null, (a) => {
    a.results["home-390-slow4g"].runs = [];
  });
});

test("FAIL: runs count mismatch with declared RUNS", () => {
  expectFail("runs count mismatch", null, (a) => {
    a.results["home-390-slow4g"].runs = [{ loadMs: 1, lcp: 1, cls: 0, imgBytes: 1, imgCount: 1, jsBytes: 1 }];
  });
});

test("FAIL: baseline scenario missing (incompatible structures)", () => {
  expectFail("baseline scenario missing", (b) => {
    delete b.results["home-1440"];
  });
});

test("FAIL: baseline imgBytes non-numeric (incompatible structures)", () => {
  expectFail("baseline imgBytes corrupt", (b) => {
    b.results["home-1440"].imgBytes = "many";
  });
});

test("FAIL: absolute gate still enforced (CLS 0.2)", () => {
  expectFail("CLS 0.2", null, (a) => {
    a.results["home-390-slow4g"].median.cls = 0.2;
  });
});

test("FAIL: absolute gate still enforced (desktop LCP over budget)", () => {
  expectFail("desktop LCP 2000ms", null, (a) => {
    a.results["home-1440"].median.lcp = 2000;
  });
});

test("FAIL: image win gate still enforced (no ≥30% improvement)", () => {
  expectFail("image win", null, (a) => {
    a.results["home-390-slow4g"].median.imgBytes = 250_000;
  });
});

test("CLI exits non-zero (1) on corrupt evidence", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "f8-budgets-"));
  const corruptFile = path.join(dir, "corrupt-after.json");
  const baselineFile = path.join(dir, "baseline.json");
  const corrupt = validAfter();
  delete corrupt.results["detail-390-slow4g"];
  corrupt.results["home-390-slow4g"].median.cls = NaN;
  writeFileSync(corruptFile, JSON.stringify(corrupt));
  writeFileSync(baselineFile, JSON.stringify(BASELINE));

  assert.throws(
    () => execFileSync(process.execPath, [CLI, baselineFile, corruptFile], { stdio: "pipe" }),
    (err) => err.status === 1,
    "CLI must exit 1 on corrupt evidence"
  );
});

test("CLI exits non-zero (2) on unreadable JSON", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "f8-budgets-"));
  const bad = path.join(dir, "bad.json");
  const baselineFile = path.join(dir, "baseline.json");
  writeFileSync(bad, "{ not json");
  writeFileSync(baselineFile, JSON.stringify(BASELINE));
  assert.throws(
    () => execFileSync(process.execPath, [CLI, baselineFile, bad], { stdio: "pipe" }),
    (err) => err.status === 2,
    "CLI must exit 2 on unreadable JSON"
  );
});
