/**
 * Control Center operator allowlist (server).
 * Canonical ADMIN_EMAIL still maps to admin-1; extra emails/names keep their own user id.
 */

const DEFAULT_ADMIN_EMAIL = "admin@vauto.com";
const DEFAULT_ADMIN_NAMES = ["arnas", "arnasbond"];

export function resolveAdminEmail(): string {
  return (process.env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
}

export function resolveAdminEmails(): string[] {
  const primary = resolveAdminEmail();
  const extras = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([primary, ...extras])];
}

export function resolveAdminNames(): string[] {
  const extras = (process.env.ADMIN_NAMES ?? "")
    .split(",")
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ADMIN_NAMES, ...extras])];
}

export function normalizePhoneDigits(phone?: string | null): string {
  return (phone ?? "").replace(/\D/g, "");
}

export function resolveAdminPhone(): string {
  return normalizePhoneDigits(process.env.ADMIN_PHONE ?? "+37060000099");
}

export function isAllowlistedAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return resolveAdminEmails().includes(email.trim().toLowerCase());
}

export function isAllowlistedAdminName(name?: string | null): boolean {
  if (!name) return false;
  return resolveAdminNames().includes(name.trim().toLowerCase());
}

/** Elevate to super_admin without forcing remapping to admin-1. */
export function shouldElevateToSuperAdmin(opts: {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  nickname?: string | null;
  firstName?: string | null;
  metaRole?: string;
}): boolean {
  if (isAllowlistedAdminEmail(opts.email)) return true;
  if (isAllowlistedAdminName(opts.name)) return true;
  if (isAllowlistedAdminName(opts.nickname)) return true;
  if (isAllowlistedAdminName(opts.firstName)) return true;
  if (isAllowlistedAdminName(opts.name?.split(/\s+/)[0])) return true;
  if (
    opts.metaRole === "admin" &&
    normalizePhoneDigits(opts.phone) === resolveAdminPhone()
  ) {
    return true;
  }
  return false;
}

/** Only the primary ADMIN_EMAIL (or admin phone path) becomes canonical admin-1. */
export function shouldUseCanonicalAdminId(opts: {
  email?: string | null;
  phone?: string | null;
  metaRole?: string;
}): boolean {
  if (opts.email?.trim().toLowerCase() === resolveAdminEmail()) return true;
  if (
    opts.metaRole === "admin" &&
    normalizePhoneDigits(opts.phone) === resolveAdminPhone()
  ) {
    return true;
  }
  return false;
}
