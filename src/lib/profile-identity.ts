import type { UserProfile } from "@/lib/types";
import { DEFAULT_USER_AVATAR } from "@/lib/avatar-url";

/** Stock Unsplash avatars used at OTP/OAuth bootstrap — not a real user photo. */
const STOCK_AVATAR_URLS = new Set([
  DEFAULT_USER_AVATAR,
  "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop",
]);

const PLACEHOLDER_DISPLAY_NAMES = new Set([
  "mobilus vartotojas",
  "google vartotojas",
  "apple vartotojas",
  "vartotojas",
  "svečias",
  "svecias",
]);

export function isPlaceholderDisplayName(value?: string | null): boolean {
  const t = String(value ?? "").trim().toLowerCase();
  if (!t) return true;
  return PLACEHOLDER_DISPLAY_NAMES.has(t);
}

export function isStockAvatar(url?: string | null): boolean {
  const t = String(url ?? "").trim();
  if (!t) return true;
  if (STOCK_AVATAR_URLS.has(t)) return true;
  // Match Unsplash stock IDs even if query params differ.
  if (/images\.unsplash\.com\/photo-1472099645785-5658abf4ff4e/i.test(t)) {
    return true;
  }
  if (/images\.unsplash\.com\/photo-1507003211169-0a1dd7228f2d/i.test(t)) {
    return true;
  }
  return false;
}

export function hasRealNickname(user: Pick<UserProfile, "nickname">): boolean {
  const nick = user.nickname?.trim() ?? "";
  if (nick.length < 2) return false;
  return !isPlaceholderDisplayName(nick);
}

export function hasRealAvatar(user: Pick<UserProfile, "avatar">): boolean {
  return !isStockAvatar(user.avatar);
}

/**
 * After auth (+ profile type), require a real nickname and non-stock avatar.
 * Admins are exempt (same pattern as needsProfileTypeSelection).
 */
export function needsProfileIdentity(
  user: Pick<UserProfile, "nickname" | "avatar" | "role">
): boolean {
  if (user.role === "admin" || user.role === "super_admin") return false;
  return !hasRealNickname(user) || !hasRealAvatar(user);
}

/** Prefer nickname → firstName → non-placeholder name token; else empty (guest greeting). */
export function resolveFriendlyGreetingName(
  user?: Pick<UserProfile, "nickname" | "firstName" | "name"> | null,
  fallbackName?: string
): string {
  const nick = user?.nickname?.trim();
  if (nick && !isPlaceholderDisplayName(nick)) return nick;
  const first = user?.firstName?.trim();
  if (first && !isPlaceholderDisplayName(first)) return first;
  const full = (user?.name?.trim() || fallbackName?.trim() || "").trim();
  if (!full || isPlaceholderDisplayName(full)) return "";
  const token = full.split(/\s+/)[0] || full;
  if (isPlaceholderDisplayName(token) || /^mobilus$/i.test(token)) return "";
  return token;
}
