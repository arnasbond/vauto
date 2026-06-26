/** Server `validateUser` caps avatar at 1000 chars — keep URLs/data URLs under that. */
export const API_AVATAR_MAX_LENGTH = 1000;

export const DEFAULT_USER_AVATAR =
  "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop";

export function isOversizedAvatar(value: string | undefined | null): boolean {
  if (!value) return false;
  return value.trim().length > API_AVATAR_MAX_LENGTH;
}

/** Strip oversized base64 blobs before API sync; prefer stable HTTPS default. */
export function sanitizeAvatarForApi(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return DEFAULT_USER_AVATAR;
  if (trimmed.length <= API_AVATAR_MAX_LENGTH) return trimmed;
  if (trimmed.startsWith("data:")) return DEFAULT_USER_AVATAR;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.slice(0, API_AVATAR_MAX_LENGTH);
  }
  return DEFAULT_USER_AVATAR;
}
