/**
 * F8 Metrics Collector — single-source pure logic for the perf probe.
 *
 * Contract (unit-tested):
 *   - exactly ONE LCP slot (latest LCP wins, never summed);
 *   - CLS is summed ONCE: each layout-shift entry contributes at most one
 *     time even if a buffered replay delivers the same entry object again
 *     (the double-observer bug); entries with hadRecentInput are ignored;
 *   - measurement window is explicit: start() … stop().
 */
export function createMetricsCollector() {
  let lcp = null;
  let lcpElement = null;
  let cls = 0;
  let started = false;
  let stopped = false;
  const seenShiftEntries = new Set();
  const shifts = [];

  function onLcpEntry(entry) {
    if (stopped) return;
    lcp = entry.startTime;
    try {
      lcpElement = entry.element
        ? `${entry.element.tagName}.${String(entry.element.className).slice(0, 60)}`
        : entry.url?.slice(0, 80) ?? "unknown";
    } catch {
      lcpElement = "unknown";
    }
  }

  function onShiftEntry(entry) {
    if (stopped) return;
    if (!entry || entry.hadRecentInput) return;
    if (seenShiftEntries.has(entry)) return;
    seenShiftEntries.add(entry);
    cls += entry.value;
    if (shifts.length < 25) {
      let src = null;
      try {
        const s = entry.sources?.[0];
        if (s?.node) {
          const n = s.node;
          src = `${n.nodeName}${n.id ? "#" + n.id : ""}.${String(n.className).slice(0, 60)}`;
        }
      } catch {
        /* attribution optional */
      }
      shifts.push({ value: entry.value, startTime: entry.startTime, src });
    }
  }

  const observers = [];

  function start() {
    if (started || stopped) return;
    started = true;
    try {
      const lcpObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) onLcpEntry(entry);
      });
      lcpObs.observe({ type: "largest-contentful-paint", buffered: true });
      observers.push(lcpObs);

      const clsObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) onShiftEntry(entry);
      });
      clsObs.observe({ type: "layout-shift", buffered: true });
      observers.push(clsObs);
    } catch {
      /* unsupported — collector stays empty */
    }
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    for (const o of observers) o.disconnect();
  }

  function snapshot() {
    return { lcp, lcpElement, cls, shifts };
  }

  return { start, stop, snapshot, _internals: { onLcpEntry, onShiftEntry } };
}
