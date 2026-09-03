/**
 * F8 Network Profiles — the single canonical source for CDP throttling.
 *
 * Fast 3G is GENUINELY faster than Slow 4G on BOTH latency and throughput
 * (this was previously inverted — the old Fast 3G had HIGHER latency):
 *   - SLOW_4G: 400ms RTT, 1.6 Mbps down, 0.75 Mbps up (slow mobile);
 *   - FAST_3G: 150ms RTT, 3.0 Mbps down, 1.0 Mbps up (faster link).
 * CPU throttling rate 4 applies to both mobile profiles.
 */
export const NETWORK_PROFILES = {
  SLOW_4G: {
    label: "slow-4g",
    latency: 400,
    downloadMbps: 1.6,
    uploadMbps: 0.75,
    cpu: 4,
  },
  FAST_3G: {
    label: "fast-3g",
    latency: 150,
    downloadMbps: 3.0,
    uploadMbps: 1.0,
    cpu: 4,
  },
  NONE: { label: "none", latency: 0, downloadMbps: 0, uploadMbps: 0, cpu: 0 },
};

export function toCdpConditions(profile) {
  if (!profile || profile === NETWORK_PROFILES.NONE) return null;
  return {
    offline: false,
    latency: profile.latency,
    downloadThroughput: (profile.downloadMbps * 1024 * 1024) / 8,
    uploadThroughput: (profile.uploadMbps * 1024 * 1024) / 8,
  };
}

/** Sanity: Fast 3G must beat Slow 4G on latency AND throughput. */
export function validateProfileOrdering() {
  const fast = NETWORK_PROFILES.FAST_3G;
  const slow = NETWORK_PROFILES.SLOW_4G;
  return fast.latency < slow.latency && fast.downloadMbps > slow.downloadMbps;
}
