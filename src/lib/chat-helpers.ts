import type { ChatThread, Listing, ListingCategory } from "@/lib/types";

const QUESTIONS: Record<ListingCategory | "default", string[]> = {
  electronics: [
    "Ar siunčiate į kitus miestus?",
    "Ar kaina galutinė?",
    "Kokia baterijos būklė?",
  ],
  vehicles: [
    "Ar galima apžiūrėti šiandien?",
    "Ar kaina galutinė?",
    "Ar yra serviso istorija?",
  ],
  transport: [
    "Ar galima apžiūrėti?",
    "Ar kaina galutinė?",
    "Koks tikslus tipas / rida?",
  ],
  services: [
    "Kada turite laisvą laiką?",
    "Ar išrašote sąskaitą faktūrą?",
    "Kiek kainuoja atvykimas?",
  ],
  jobs: [
    "Kada galima pradėti darbą?",
    "Ar atlyginimas bruto ar neto?",
    "Ar reikia patirties?",
  ],
  home: [
    "Ar galima atsiimti šiandien?",
    "Ar kaina galutinė?",
    "Ar siunčiate?",
  ],
  clothing: [
    "Koks tikslus dydis?",
    "Ar siunčiate?",
    "Ar galima pasimatuoti?",
  ],
  real_estate: [
    "Kada galima apžiūrėti?",
    "Ar galima derėtis dėl kainos?",
    "Ar yra hipoteka?",
  ],
  tools: [
    "Ar galima išbandyti?",
    "Ar komplekte yra priedai?",
    "Ar siunčiate?",
  ],
  rental: [
    "Koks minimalus nuomos periodas?",
    "Koks užstatas?",
    "Ar pristatote?",
  ],
  other: [
    "Ar dar aktualu?",
    "Ar kaina galutinė?",
    "Ar galima susitikti šiandien?",
  ],
  default: [
    "Ar dar parduodate?",
    "Ar kaina galutinė?",
    "Ar galima susitikti?",
  ],
};

export function getQuickQuestions(listing: Listing | undefined): string[] {
  if (!listing) return QUESTIONS.default;
  return QUESTIONS[listing.category] ?? QUESTIONS.default;
}

/** Unread messages addressed to this user in a thread */
export function countUnreadInThread(
  thread: ChatThread,
  userId: string
): number {
  return thread.messages.filter(
    (m) => m.senderId !== userId && !m.readAt
  ).length;
}

export function countUnreadChats(
  chats: ChatThread[],
  userId: string
): number {
  return chats.reduce(
    (sum, thread) => sum + countUnreadInThread(thread, userId),
    0
  );
}

export function hasUnreadInThread(
  thread: ChatThread,
  userId: string
): boolean {
  return countUnreadInThread(thread, userId) > 0;
}
