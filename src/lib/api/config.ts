/** Express + PostgreSQL backend (optional). */
export function getDataApiBaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  return url || null;
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
