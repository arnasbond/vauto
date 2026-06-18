export function getApiBaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  return url || null;
}

export function isApiEnabled(): boolean {
  return Boolean(getApiBaseUrl());
}
