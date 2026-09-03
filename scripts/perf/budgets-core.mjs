/**
 * F8 Performance Budgets — FAIL-CLOSED core.
 *
 * The checker refuses to PASS when the evidence itself is broken. Missing
 * scenarios, non-numeric/NaN/Infinity/negative values, zero-byte media on
 * media scenarios, absent LCP attribution, incomplete median structures or
 * incompatible baseline/after shapes are all FAILURES (not skips).
 *
 * Consumed by the CLI (scripts/perf/check-perf-budgets.mjs) and by pure
 * unit tests (scripts/perf/__tests__/budgets-failclosed.test.mjs).
 */

export const REQUIRED_SCENARIOS = [
  "home-390-slow4g",
  "search-390-slow4g",
  "detail-390-slow4g",
  "home-390-fast3g",
  "home-1440",
  "detail-1440",
];

const ABS_CLS_MAX = 0.1;
const ABS_LCP_TARGET_MS = 5000;
const ABS_LCP_WARN_MS = 8000;
const ABS_LCP_DESKTOP_MS = 1500;
const ABS_HOME_IMG_MAX = 200_000;
const JS_ABSOLUTE_MAX = 900_000;
const IMAGE_WIN_MIN = 0.3;

const MOBILE_SCENARIOS = [
  "home-390-slow4g",
  "search-390-slow4g",
  "detail-390-slow4g",
  "home-390-fast3g",
];
const DESKTOP_SCENARIOS = ["home-1440", "detail-1440"];

const REQUIRED_MEDIAN_KEYS = ["lcp", "cls", "imgBytes", "imgCount", "jsBytes"];

const isNonNegativeNumber = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** Read a metric from a v2 (median) or v1-legacy (flat) scenario entry. */
const val = (entry, key) => entry?.median?.[key] ?? entry?.[key];

/**
 * @returns {{ failures: number, warnings: number }}
 */
export function checkBudgets(baselineDoc, afterDoc, log = console) {
  let failures = 0;
  let warnings = 0;
  const check = (cond, label, detail) => {
    if (cond) log.log(`  ok  ${label}`);
    else {
      failures += 1;
      log.error(`  FAIL ${label} — ${detail}`);
    }
  };
  const warn = (cond, label, detail) => {
    if (!cond) {
      warnings += 1;
      log.warn(`  WARN ${label} — ${detail}`);
    }
  };

  // ---------- fail-closed structural validation ----------
  if (!afterDoc || typeof afterDoc !== "object" || !afterDoc.results) {
    check(false, "after document has a results object", "missing/invalid results");
    return { failures, warnings };
  }
  if (!baselineDoc || typeof baselineDoc !== "object" || !baselineDoc.results) {
    check(false, "baseline document has a results object", "missing/invalid results");
    return { failures, warnings };
  }
  const after = afterDoc.results;
  const baseline = baselineDoc.results;

  for (const id of REQUIRED_SCENARIOS) {
    const before = failures;
    const a = after[id];
    if (!a) {
      check(false, `${id}: required scenario present in the after run`, "missing scenario");
      continue;
    }

    const median = a.median;
    if (!median || typeof median !== "object") {
      check(false, `${id}: median structure present`, "median is missing — incomplete structure");
      continue;
    }
    for (const key of REQUIRED_MEDIAN_KEYS) {
      const v = median[key];
      if (!isNonNegativeNumber(v)) {
        check(
          false,
          `${id}: median.${key} is a valid non-negative number`,
          `got ${JSON.stringify(v)} (missing/NaN/Infinity/negative)`
        );
      }
    }
    if (!(median.lcp > 0)) {
      check(false, `${id}: median.lcp is a positive number`, `lcp=${median.lcp} — semantically impossible`);
    }
    if (!(median.jsBytes > 0)) {
      check(false, `${id}: median.jsBytes is a positive number`, `jsBytes=${median.jsBytes} — semantically impossible`);
    }
    if (
      typeof median.lcpElement !== "string" ||
      median.lcpElement.trim().length === 0
    ) {
      check(false, `${id}: lcpElement attribution present`, "missing/empty LCP element attribution");
    }

    const runs = a.runs;
    if (!Array.isArray(runs) || runs.length === 0) {
      check(false, `${id}: runs array present and non-empty`, "incomplete median structure (no runs)");
    } else if (
      typeof afterDoc.runs === "number" &&
      runs.length !== afterDoc.runs
    ) {
      check(
        false,
        `${id}: runs count matches the declared RUNS (${afterDoc.runs})`,
        `got ${runs.length} runs`
      );
    }

    if (a.mediaRequired === true) {
      if (!(median.imgBytes > 0)) {
        check(false, `${id}: media scenario imgBytes > 0`, `imgBytes=${median.imgBytes}`);
      }
      if (!(median.imgCount > 0)) {
        check(false, `${id}: media scenario imgCount > 0`, `imgCount=${median.imgCount}`);
      }
    }

    // Baseline/after structure compatibility: every comparison field used
    // below must exist numerically on BOTH sides.
    const b = baseline[id];
    if (!b) {
      check(false, `${id}: baseline scenario present`, "baseline/after structures incompatible");
    } else {
      for (const key of ["imgBytes", "jsBytes"]) {
        const bv = val(b, key);
        if (!isNonNegativeNumber(bv)) {
          check(
            false,
            `${id}: baseline ${key} is a valid non-negative number`,
            `got ${JSON.stringify(bv)} — baseline/after structures incompatible`
          );
        }
      }
    }

    if (failures === before) {
      log.log(`  ok  ${id}: evidence structure valid (median, attribution, media, runs, baseline)`);
    }
  }

  // ---------- absolute gates (release readiness) ----------
  for (const id of [...MOBILE_SCENARIOS, ...DESKTOP_SCENARIOS]) {
    const cls = after[id]?.median?.cls;
    if (isNonNegativeNumber(cls)) {
      check(
        cls <= ABS_CLS_MAX,
        `${id}: CLS ≤ ${ABS_CLS_MAX} (absolute)`,
        `cls=${cls.toFixed(4)}`
      );
    }
  }
  for (const id of MOBILE_SCENARIOS) {
    const lcp = after[id]?.median?.lcp;
    if (isNonNegativeNumber(lcp) && lcp > 0) {
      check(lcp <= ABS_LCP_WARN_MS, `${id}: mobile LCP ≤ ${ABS_LCP_WARN_MS}ms`, `lcp=${Math.round(lcp)}ms`);
      warn(lcp <= ABS_LCP_TARGET_MS, `${id}: mobile LCP release target ≤ ${ABS_LCP_TARGET_MS}ms`, `lcp=${Math.round(lcp)}ms`);
    }
  }
  for (const id of DESKTOP_SCENARIOS) {
    const lcp = after[id]?.median?.lcp;
    if (isNonNegativeNumber(lcp) && lcp > 0) {
      check(lcp <= ABS_LCP_DESKTOP_MS, `${id}: desktop LCP ≤ ${ABS_LCP_DESKTOP_MS}ms`, `lcp=${Math.round(lcp)}ms`);
    }
  }
  const homeImg = after["home-390-slow4g"]?.median?.imgBytes;
  if (isNonNegativeNumber(homeImg)) {
    check(
      homeImg <= ABS_HOME_IMG_MAX,
      `home-390-slow4g: image bytes ≤ ${ABS_HOME_IMG_MAX}`,
      `imgBytes=${homeImg}`
    );
  }

  // ---------- relative gates (no regression / required wins) ----------
  // NOTE: relative LCP/CLS gates against the v1 baseline are REMOVED — the
  // v1 probe measured a different window (no content-state wait, no scroll
  // pass), so they are methodologically incomparable. LCP/CLS are gated by
  // the ABSOLUTE budgets above; the image-byte win below remains valid
  // (same-origin category media was loaded in both probe versions).
  for (const id of REQUIRED_SCENARIOS) {
    const bImg = val(baseline[id], "imgBytes");
    const aImg = after[id]?.median?.imgBytes;
    if (isNonNegativeNumber(bImg) && bImg > 0 && isNonNegativeNumber(aImg)) {
      const win = (bImg - aImg) / bImg;
      check(
        win >= IMAGE_WIN_MIN,
        `${id}: image bytes improved by ≥30%`,
        `before=${bImg} after=${aImg} (${(win * 100).toFixed(1)}%)`
      );
    }
    const aJs = after[id]?.median?.jsBytes;
    if (isNonNegativeNumber(aJs)) {
      check(aJs <= JS_ABSOLUTE_MAX, `${id}: JS bytes ≤ ${JS_ABSOLUTE_MAX} (absolute)`, `jsBytes=${aJs}`);
    }
  }

  return { failures, warnings };
}
