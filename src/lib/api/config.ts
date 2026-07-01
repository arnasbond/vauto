/** Express + PostgreSQL backend (optional). */
import type { RuntimeConfigJson } from "@/lib/runtime-config-types";

let resolvedApiUrl: string | null = null;
let resolvedGoogleClientId: string | null = null;
let resolvedConductorEnabled: boolean | null = null;
let resolvePromise: Promise<string | null> | null = null;

function envApiUrl(): string | null {
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || null;
}

function envGoogleClientId(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? null;
}

/** Load API URL and optional Google client id from build env or /runtime-config.json. */
export async function initDataApiConfig(): Promise<string | null> {
  if (resolvedApiUrl) return resolvedApiUrl;
  if (resolvePromise) return resolvePromise;

  resolvePromise = (async () => {
    const fromEnv = envApiUrl();
    const googleFromEnv = envGoogleClientId();
    if (googleFromEnv) resolvedGoogleClientId = googleFromEnv;

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
          if (resolvedConductorEnabled === null && typeof json.conductorEnabled === "boolean") {
            resolvedConductorEnabled = json.conductorEnabled;
          }
        }
      } catch {
        /* offline or missing file */
      }
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
