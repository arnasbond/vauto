import type { AuthProvider } from "@/lib/types";

/** Stable user id from credentials only — each phone/email gets its own account. */
export function resolveStableUserId(data: {
  provider: AuthProvider;
  phone?: string;
  email?: string;
}): string {
  const phoneKey = data.phone?.replace(/\D/g, "") ?? "";
  const emailKey = data.email?.trim().toLowerCase() ?? "";
  const seed = `${data.provider}:${phoneKey || emailKey || "guest"}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return `user-${Math.abs(hash)}`;
}
