/** Express + PostgreSQL backend (optional). */
let resolvedApiUrl: string | null = null;
let resolvePromise: Promise<string | null> | null = null;

function envApiUrl(): string | null {
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || null;
}

/** Load API URL from build env or /runtime-config.json (no rebuild needed). */
export async function initDataApiConfig(): Promise<string | null> {
  if (resolvedApiUrl) return resolvedApiUrl;
  if (resolvePromise) return resolvePromise;

  resolvePromise = (async () => {
    const fromEnv = envApiUrl();
    if (fromEnv) {
      resolvedApiUrl = fromEnv;
      return fromEnv;
    }

    if (typeof window === "undefined") return null;

    try {
      const res = await fetch("/runtime-config.json", { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as { apiUrl?: string };
        const url = json.apiUrl?.replace(/\/$/, "");
        if (url) {
          resolvedApiUrl = url;
          return url;
        }
      }
    } catch {
      /* offline or missing file */
    }
    return null;
  })();

  return resolvePromise;
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
