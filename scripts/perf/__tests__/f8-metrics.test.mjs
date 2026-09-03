import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMetricsCollector } from "../f8-metrics-core.mjs";
import { NETWORK_PROFILES, validateProfileOrdering, toCdpConditions } from "../f8-networks.mjs";

describe("F8 — metrics collector (probe contract)", () => {
  it("latest LCP wins — never summed", () => {
    const c = createMetricsCollector();
    c._internals.onLcpEntry({ startTime: 900 });
    c._internals.onLcpEntry({ startTime: 1200 });
    c._internals.onLcpEntry({ startTime: 800 });
    assert.equal(c.snapshot().lcp, 800);
    assert.equal(c.snapshot().cls, 0);
  });

  it("CLS sums each entry exactly ONCE even when the same entry is replayed", () => {
    const c = createMetricsCollector();
    const e1 = { value: 0.05, hadRecentInput: false, startTime: 100 };
    const e2 = { value: 0.03, hadRecentInput: false, startTime: 400 };
    // The double-observer bug: buffered replays deliver the same objects twice.
    c._internals.onShiftEntry(e1);
    c._internals.onShiftEntry(e1);
    c._internals.onShiftEntry(e2);
    c._internals.onShiftEntry(e2);
    assert.equal(c.snapshot().cls, 0.08, "no double summation");
  });

  it("ignores hadRecentInput shifts", () => {
    const c = createMetricsCollector();
    c._internals.onShiftEntry({ value: 0.2, hadRecentInput: true, startTime: 100 });
    assert.equal(c.snapshot().cls, 0);
  });

  it("start/stop make the window explicit", () => {
    const c = createMetricsCollector();
    c.start();
    c.stop();
    c._internals.onShiftEntry({ value: 0.9, hadRecentInput: false, startTime: 100 });
    assert.equal(c.snapshot().cls, 0, "entries after stop are ignored");
  });
});

describe("F8 — network profiles", () => {
  it("Fast 3G is genuinely faster than Slow 4G (latency + throughput)", () => {
    assert.equal(validateProfileOrdering(), true);
    assert.ok(
      NETWORK_PROFILES.FAST_3G.latency < NETWORK_PROFILES.SLOW_4G.latency,
      "fast 3g latency must be lower"
    );
    assert.ok(
      NETWORK_PROFILES.FAST_3G.downloadMbps > NETWORK_PROFILES.SLOW_4G.downloadMbps,
      "fast 3g throughput must be higher"
    );
  });

  it("profiles are not identical or swapped", () => {
    const fast = NETWORK_PROFILES.FAST_3G;
    const slow = NETWORK_PROFILES.SLOW_4G;
    assert.notEqual(fast.latency, slow.latency);
    assert.notEqual(fast.downloadMbps, slow.downloadMbps);
  });

  it("CDP conditions translate throughput to bytes/sec", () => {
    const c = toCdpConditions(NETWORK_PROFILES.SLOW_4G);
    assert.equal(c.latency, 400);
    assert.equal(c.downloadThroughput, (1.6 * 1024 * 1024) / 8);
    assert.equal(toCdpConditions(NETWORK_PROFILES.NONE), null);
  });
});
