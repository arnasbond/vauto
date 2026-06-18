import type { ChatThread, Listing, UserProfile } from "@/lib/types";

const KEYS = {
  listings: "vauto_listings_v1",
  chats: "vauto_chats_v1",
  saved: "vauto_saved_v1",
  user: "vauto_user_v1",
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

export function clearAllData(): void {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
}
