/**
 * Stage 22B — map tile provider abstraction.
 *
 * The tile provider must NOT remain an unconfigurable production dependency.
 * This module is the single configuration boundary:
 * - provider URL + attribution live here (outside the presentation component);
 * - behavior is deterministic and production-safe;
 * - public tile-network availability must NOT determine application/E2E
 *   correctness — when tiles cannot load the map UI degrades gracefully while
 *   the canonical search state and results stay intact.
 *
 * No paid-provider coupling is introduced. OpenStreetMap remains the default;
 * operators may override the URL via `NEXT_PUBLIC_MAP_TILE_URL` /
 * `NEXT_PUBLIC_MAP_ATTRIBUTION` without touching presentation code.
 */

export interface MapTileProvider {
  /** Tile URL template, e.g. https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png */
  url: string;
  /** Required attribution (always preserved, never hidden). */
  attribution: string;
  /** Stable key for test assertions / diagnostics. */
  id: string;
}

export const DEFAULT_MAP_TILE_URL =
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const DEFAULT_MAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const STATIC_PROVIDERS: ReadonlyArray<MapTileProvider> = [
  {
    id: "osm-standard",
    url: DEFAULT_MAP_TILE_URL,
    attribution: DEFAULT_MAP_ATTRIBUTION,
  },
  {
    id: "osm-hot",
    url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, tiles by <a href="https://www.openstreetmap.fr">OSM France</a>',
  },
];

function sanitizeUrlTemplate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^https?:\/\/.+\.(png|jpg|jpeg)(\?.*)?$/i.test(trimmed)) return null;
  if (!trimmed.includes("{z}") || !trimmed.includes("{x}") || !trimmed.includes("{y}")) {
    return null;
  }
  return trimmed;
}

function sanitizeAttribution(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 2000 ? trimmed : null;
}

/**
 * Resolve the active tile provider.
 *
 * Deterministic resolution order:
 * 1. `NEXT_PUBLIC_MAP_TILE_URL` (with optional `NEXT_PUBLIC_MAP_ATTRIBUTION`)
 * 2. `NEXT_PUBLIC_MAP_PROVIDER` matching a static provider id (osm-standard,
 *    osm-hot)
 * 3. DEFAULT (osm-standard)
 *
 * Invalid/untrusted overrides never crash — they fall back to the default.
 */
export function resolveMapTileProvider(
  env: {
    NEXT_PUBLIC_MAP_TILE_URL?: string | null;
    NEXT_PUBLIC_MAP_ATTRIBUTION?: string | null;
    NEXT_PUBLIC_MAP_PROVIDER?: string | null;
  } = typeof process !== "undefined"
    ? (process.env as Record<string, string | undefined>)
    : {}
): MapTileProvider {
  const url = sanitizeUrlTemplate(env.NEXT_PUBLIC_MAP_TILE_URL);
  if (url) {
    const attribution =
      sanitizeAttribution(env.NEXT_PUBLIC_MAP_ATTRIBUTION) ?? DEFAULT_MAP_ATTRIBUTION;
    return { id: "custom", url, attribution };
  }
  const byId = env.NEXT_PUBLIC_MAP_PROVIDER?.trim();
  if (byId) {
    const matched = STATIC_PROVIDERS.find((p) => p.id === byId);
    if (matched) return { ...matched };
  }
  return { ...STATIC_PROVIDERS[0] };
}

/** True when the environment override points at an unknown/static provider id. */
export function isDefaultTileProvider(provider: MapTileProvider): boolean {
  return provider.id === "osm-standard" || provider.id === "custom";
}
