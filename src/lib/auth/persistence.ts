import { Capacitor } from "@capacitor/core";
import type { AuthSession, UserProfile } from "@/lib/types";

const AUTH_SESSION_KEY = "vauto_auth_v1";
const AUTH_USER_KEY = "vauto_user_v1";
const AUTH_TOKEN_KEY = "vauto_access_token_v1";

export interface PersistedAuthBundle {
  session: AuthSession | null;
  user: UserProfile | null;
  token: string | null;
}

function readLocal<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

function removeLocal(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key);
}

async function preferencesGet(key: string): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key });
    return value;
  } catch {
    return null;
  }
}

async function preferencesSet(key: string, value: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key, value });
  } catch {
    /* ignore */
  }
}

async function preferencesRemove(key: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key });
  } catch {
    /* ignore */
  }
}

/** Load auth from Capacitor Preferences (native) with localStorage fallback. */
export async function loadPersistedAuth(): Promise<PersistedAuthBundle> {
  if (typeof window === "undefined") {
    return { session: null, user: null, token: null };
  }

  if (Capacitor.isNativePlatform()) {
    const [sessionRaw, userRaw, tokenRaw] = await Promise.all([
      preferencesGet(AUTH_SESSION_KEY),
      preferencesGet(AUTH_USER_KEY),
      preferencesGet(AUTH_TOKEN_KEY),
    ]);

    if (sessionRaw || userRaw || tokenRaw) {
      let session: AuthSession | null = null;
      let user: UserProfile | null = null;
      try {
        if (sessionRaw) session = JSON.parse(sessionRaw) as AuthSession;
        if (userRaw) user = JSON.parse(userRaw) as UserProfile;
      } catch {
        /* corrupt */
      }
      const token = tokenRaw ?? session?.accessToken ?? null;

      if (session) writeLocal(AUTH_SESSION_KEY, session);
      if (user) writeLocal(AUTH_USER_KEY, user);
      if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);

      return { session, user, token };
    }
  }

  const session = readLocal<AuthSession>(AUTH_SESSION_KEY);
  const user = readLocal<UserProfile>(AUTH_USER_KEY);
  let token: string | null = null;
  try {
    token = localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    token = null;
  }

  return {
    session,
    user,
    token: token ?? session?.accessToken ?? null,
  };
}

export async function persistAuthBundle(
  session: AuthSession,
  user: UserProfile,
  token?: string | null
): Promise<void> {
  writeLocal(AUTH_SESSION_KEY, session);
  writeLocal(AUTH_USER_KEY, user);

  const accessToken = token ?? session.accessToken ?? null;
  if (accessToken) {
    try {
      localStorage.setItem(AUTH_TOKEN_KEY, accessToken);
    } catch {
      /* ignore */
    }
  } else {
    removeLocal(AUTH_TOKEN_KEY);
    try {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }

  if (Capacitor.isNativePlatform()) {
    await Promise.all([
      preferencesSet(AUTH_SESSION_KEY, JSON.stringify(session)),
      preferencesSet(AUTH_USER_KEY, JSON.stringify(user)),
      accessToken
        ? preferencesSet(AUTH_TOKEN_KEY, accessToken)
        : preferencesRemove(AUTH_TOKEN_KEY),
    ]);
  }
}

export async function clearPersistedAuth(): Promise<void> {
  removeLocal(AUTH_SESSION_KEY);
  removeLocal(AUTH_USER_KEY);
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    /* ignore */
  }

  if (Capacitor.isNativePlatform()) {
    await Promise.all([
      preferencesRemove(AUTH_SESSION_KEY),
      preferencesRemove(AUTH_USER_KEY),
      preferencesRemove(AUTH_TOKEN_KEY),
    ]);
  }
}
