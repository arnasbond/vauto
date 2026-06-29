import type { UserProfile } from "@/lib/types";

/** Public profile label — nickname only; never exposes legal first/last name. */
export function displayPublicNickname(
  user: Pick<UserProfile, "nickname" | "name">
): string {
  const nick = user.nickname?.trim();
  if (nick) return nick;
  return "Vartotojas";
}

/** Display name: vardas + pavardė, arba nikas, arba legacy `name`. */
export function displayUserName(
  user: Pick<UserProfile, "firstName" | "lastName" | "nickname" | "name">
): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (full) return full;
  const nick = user.nickname?.trim();
  if (nick) return nick;
  return user.name?.trim() || "Vartotojas";
}

export function splitUserName(user: UserProfile): {
  firstName: string;
  lastName: string;
  nickname: string;
} {
  if (user.firstName || user.lastName || user.nickname) {
    return {
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      nickname: user.nickname ?? "",
    };
  }
  const raw = (user.name ?? "").trim();
  if (!raw) return { firstName: "", lastName: "", nickname: "" };
  const parts = raw.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "", nickname: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
    nickname: "",
  };
}

export function composeUserName(parts: {
  firstName?: string;
  lastName?: string;
  nickname?: string;
  fallback?: string;
}): string {
  const full = [parts.firstName, parts.lastName].filter(Boolean).join(" ").trim();
  if (full) return full;
  const nick = parts.nickname?.trim();
  if (nick) return nick;
  return parts.fallback?.trim() || "Vartotojas";
}
