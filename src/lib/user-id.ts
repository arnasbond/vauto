import type { AuthProvider } from "@/lib/types";
import { loadUser } from "@/lib/storage";

/** Stable user id across logins (phone/email/provider seed). */
export function resolveStableUserId(data: {
  provider: AuthProvider;
  phone?: string;
  email?: string;
}): string {
  const phoneKey = data.phone?.replace(/\D/g, "") ?? "";
  const emailKey = data.email?.trim().toLowerCase() ?? "";
  const existing = loadUser();

  if (existing?.id && phoneKey && existing.phone?.replace(/\D/g, "") === phoneKey) {
    return existing.id;
  }
  if (existing?.id && emailKey && existing.email?.toLowerCase() === emailKey) {
    return existing.id;
  }

  const seed = `${data.provider}:${phoneKey || emailKey || "guest"}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return `user-${Math.abs(hash)}`;
}
