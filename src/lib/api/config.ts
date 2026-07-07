/** Express + PostgreSQL backend (optional). */
import type { RuntimeConfigJson } from "@/lib/runtime-config-types";

let resolvedApiUrl: string | null = null;
let resolvedGoogleClientId: string | null = null;
let resolvedAppleClientId: string | null = null;
let resolvedConductorEnabled: boolean | null = null;
let resolvePromise: Promise<string | null> | null = null;

const authConfigListeners = new Set<() => void>();

function notifyAuthConfigListeners(): void {
  for (const listener of authConfigListeners) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

/** Subscribe when Google/Apple client ids hydrate from runtime-config or API. */
export function onAuthConfigReady(listener: () => void): () => void {
  authConfigListeners.add(listener);
  return () => authConfigListeners.delete(listener);
}

async function hydrateAuthPublicConfig(apiUrl: string): Promise<void> {
  if (resolvedGoogleClientId && resolvedAppleClientId) return;
  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/auth/public-config`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const json = (await res.json()) as {
      googleClientId?: string;
      appleClientId?: string;
    };
    let changed = false;
    if (!resolvedGoogleClientId && json.googleClientId) {
      resolvedGoogleClientId = json.googleClientId;
      changed = true;
    }
    if (!resolvedAppleClientId && json.appleClientId) {
      resolvedAppleClientId = json.appleClientId;
      changed = true;
    }
    if (changed) notifyAuthConfigListeners();
  } catch {
    /* offline */
  }
}

function envApiUrl(): string | null {
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || null;
}

function envGoogleClientId(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? null;
}

function envAppleClientId(): string | null {
  return process.env.NEXT_PUBLIC_APPLE_AUTH_CLIENT_ID ?? null;
}

/** Load API URL and optional Google client id from build env or /runtime-config.json. */
export async function initDataApiConfig(): Promise<string | null> {
  if (resolvedApiUrl) return resolvedApiUrl;
  if (resolvePromise) return resolvePromise;

  resolvePromise = (async () => {
    const fromEnv = envApiUrl();
    const googleFromEnv = envGoogleClientId();
    const appleFromEnv = envAppleClientId();
    if (googleFromEnv) resolvedGoogleClientId = googleFromEnv;
    if (appleFromEnv) resolvedAppleClientId = appleFromEnv;

    if (typeof window !== "undefined") {
      try {
        const res = await fetch("/runtime-config.json", { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as RuntimeConfigJson;
          if (!resolvedApiUrl) {
            const url = json.apiUrl?.replace(/\/$/, "");
            if (url) resolvedApiUrl = url;
          }
          if (!resolvedGoogleClientId && json.googleClientId) {
            resolvedGoogleClientId = json.googleClientId;
          }
          if (!resolvedAppleClientId && json.appleClientId) {
            resolvedAppleClientId = json.appleClientId;
          }
          if (resolvedConductorEnabled === null && typeof json.conductorEnabled === "boolean") {
            resolvedConductorEnabled = json.conductorEnabled;
          }
        }
      } catch {
        /* offline or missing file */
      }
    }

    const apiCandidate = fromEnv || resolvedApiUrl;
    if (apiCandidate && (!resolvedGoogleClientId || !resolvedAppleClientId)) {
      await hydrateAuthPublicConfig(apiCandidate);
    }

    if (fromEnv) {
      resolvedApiUrl = fromEnv;
      return fromEnv;
    }

    return resolvedApiUrl;
  })();

  return resolvePromise;
}

/** Conductor flag from runtime-config.json after initDataApiConfig (null if unset). */
export function peekRuntimeConductorEnabled(): boolean | null {
  return resolvedConductorEnabled;
}

export function getRuntimeGoogleClientId(): string | null {
  return resolvedGoogleClientId || envGoogleClientId();
}

export function getRuntimeAppleClientId(): string | null {
  return resolvedAppleClientId || envAppleClientId();
}

/** Force-fetch OAuth client ids from API (e.g. when opening auth modal). */
export async function ensureAuthPublicConfig(): Promise<void> {
  await initDataApiConfig();
  const base = getDataApiBaseUrl();
  if (!base) return;
  await hydrateAuthPublicConfig(base);
}

export function getDataApiBaseUrl(): string | null {
  return resolvedApiUrl || envApiUrl();
}

export function isDataApiEnabled(): boolean {
  return Boolean(getDataApiBaseUrl());
}

/** AI proxy: Express server or same-origin Vercel /api/ai/*. */
export function getAiBaseUrl(): string | null {
  const dataApi = getDataApiBaseUrl();
  if (dataApi) return dataApi;
  if (typeof window !== "undefined") return window.location.origin;
  return null;
}

export function isAiProxyAvailable(): boolean {
  return Boolean(getAiBaseUrl());
}

/** @deprecated use isDataApiEnabled */
export function isApiEnabled(): boolean {
  return isDataApiEnabled();
}

/** @deprecated use getDataApiBaseUrl */
export function getApiBaseUrl(): string | null {
  return getDataApiBaseUrl();
}
