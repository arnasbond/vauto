import type { AuthSession, ChatThread, Listing, SupportReport, UserProfile } from "@/lib/types";

const KEYS = {
  listings: "vauto_listings_v1",
  chats: "vauto_chats_v1",
  saved: "vauto_saved_v1",
  user: "vauto_user_v1",
  auth: "vauto_auth_v1",
  reports: "vauto_reports_v1",
  bannedUsers: "vauto_banned_users_v1",
  gdprConsent: "vauto_gdpr_consent_v1",
} as const;

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded — ignore */
  }
}

export function loadListings(): Listing[] | null {
  return read<Listing[]>(KEYS.listings);
}

export function saveListings(listings: Listing[]): void {
  write(KEYS.listings, listings);
}

export function loadChats(): ChatThread[] | null {
  return read<ChatThread[]>(KEYS.chats);
}

export function saveChats(chats: ChatThread[]): void {
  write(KEYS.chats, chats);
}

export function loadSavedIds(): string[] | null {
  return read<string[]>(KEYS.saved);
}

export function saveSavedIds(ids: Set<string>): void {
  write(KEYS.saved, Array.from(ids));
}

export function loadUser(): UserProfile | null {
  return read<UserProfile>(KEYS.user);
}

export function saveUser(user: UserProfile): void {
  write(KEYS.user, user);
}

export function loadAuthSession(): AuthSession | null {
  return read<AuthSession>(KEYS.auth);
}

export function saveAuthSession(session: AuthSession): void {
  write(KEYS.auth, session);
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEYS.auth);
}

export function loadReports(): SupportReport[] | null {
  return read<SupportReport[]>(KEYS.reports);
}

export function saveReports(reports: SupportReport[]): void {
  write(KEYS.reports, reports);
}

export function loadBannedUserIds(): string[] | null {
  return read<string[]>(KEYS.bannedUsers);
}

export function saveBannedUserIds(ids: string[]): void {
  write(KEYS.bannedUsers, ids);
}

export function loadGdprConsent(): boolean {
  return read<boolean>(KEYS.gdprConsent) === true;
}

export function saveGdprConsent(accepted: boolean): void {
  write(KEYS.gdprConsent, accepted);
}

export function clearAllData(): void {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
}
