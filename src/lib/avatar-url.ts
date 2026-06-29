/** HTTPS avatar URL cap for legacy PATCH /api/users/:id/avatar */
export const API_AVATAR_MAX_LENGTH = 2048;

/** Inline data URL cap when Cloudinary is unavailable */
export const API_AVATAR_DATA_URL_MAX = 80_000;

export const DEFAULT_USER_AVATAR =
  "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop";

export function isOversizedAvatar(value: string | undefined | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.startsWith("data:")) {
    return trimmed.length > API_AVATAR_DATA_URL_MAX;
  }
  return trimmed.length > API_AVATAR_MAX_LENGTH;
}

/** Prepare avatar for API sync — keep Cloudinary URLs; allow compact data URLs. */
export function sanitizeAvatarForApi(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return DEFAULT_USER_AVATAR;
  if (trimmed.startsWith("data:")) {
    if (trimmed.length <= API_AVATAR_DATA_URL_MAX) return trimmed;
    return DEFAULT_USER_AVATAR;
  }
  if (trimmed.length <= API_AVATAR_MAX_LENGTH) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.slice(0, API_AVATAR_MAX_LENGTH);
  }
  return DEFAULT_USER_AVATAR;
}
