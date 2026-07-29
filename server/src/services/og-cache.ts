/** Tiny in-memory TTL cache for OG HTML documents (per listing key). */

type CacheEntry = {
  html: string;
  etag: string;
  expiresAt: number;
};

const store = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1h
const MAX_ENTRIES = 500;

export function getOgCache(key: string): CacheEntry | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return hit;
}

export function setOgCache(
  key: string,
  html: string,
  etag: string,
  ttlMs = DEFAULT_TTL_MS
): void {
  if (store.size >= MAX_ENTRIES) {
    const first = store.keys().next().value;
    if (first) store.delete(first);
  }
  store.set(key, { html, etag, expiresAt: Date.now() + ttlMs });
}

export function invalidateOgCache(keys: string[]): void {
  for (const key of keys) {
    store.delete(key);
    store.delete(key.toLowerCase());
  }
}

export function ogCacheKey(idOrSlug: string): string {
  return idOrSlug.trim().toLowerCase();
}
