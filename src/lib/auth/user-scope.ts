const ACTIVE_USER_KEY = "vauto_active_user_id_v1";

const LEGACY_USER_DATA_KEYS = [
  "vauto_listings_v1",
  "vauto_saved_v1",
  "vauto_chats_v1",
] as const;

export function scopedStorageKey(baseKey: string, userId: string): string {
  return `${baseKey}__${userId}`;
}

export function getActiveUserScope(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ACTIVE_USER_KEY);
  } catch {
    return null;
  }
}

function migrateLegacyKeyToUser(baseKey: string, userId: string): void {
  if (typeof window === "undefined") return;
  try {
    const legacy = localStorage.getItem(baseKey);
    if (!legacy) return;
    const scoped = scopedStorageKey(baseKey, userId);
    if (!localStorage.getItem(scoped)) {
      localStorage.setItem(scoped, legacy);
    }
    localStorage.removeItem(baseKey);
  } catch {
    /* ignore */
  }
}

/**
 * Activates per-user storage namespace. Migrates legacy global keys into the
 * previous user's scope, then clears global keys so the next user cannot bleed data.
 */
export function activateUserScope(userId: string): void {
  if (typeof window === "undefined" || !userId || userId === "guest") return;

  const previous = getActiveUserScope();
  if (previous && previous !== userId) {
    for (const key of LEGACY_USER_DATA_KEYS) {
      migrateLegacyKeyToUser(key, previous);
    }
    clearLegacyGlobalUserData();
  }

  try {
    localStorage.setItem(ACTIVE_USER_KEY, userId);
  } catch {
    /* ignore */
  }
}

export function clearUserScope(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ACTIVE_USER_KEY);
  } catch {
    /* ignore */
  }
}

export function clearLegacyGlobalUserData(): void {
  if (typeof window === "undefined") return;
  for (const key of LEGACY_USER_DATA_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}
