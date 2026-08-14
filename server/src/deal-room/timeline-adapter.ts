/**
 * Adapt 11C timeline items → Deal Room preview (10–20 newest).
 */

import type { DealRoomTimelineItem } from "./types.js";

export type TimelineSourceItem = {
  id: string;
  messageType: "USER_MESSAGE" | "DOMAIN_EVENT" | string;
  eventType: string | null;
  senderId: string | null;
  textSafe?: string;
  text?: string;
  createdAt: string;
};

export function adaptTimelinePreview(
  items: TimelineSourceItem[],
  limit = 15
): DealRoomTimelineItem[] {
  const capped = Math.min(20, Math.max(10, limit));
  // Prefer newest; source may be ascending — take last N then keep chronological
  const sorted = [...items].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
  );
  const slice = sorted.slice(-capped);
  return slice.map((it) => ({
    id: it.id,
    messageType:
      it.messageType === "DOMAIN_EVENT" ? "DOMAIN_EVENT" : "USER_MESSAGE",
    eventType: it.eventType,
    senderId: it.senderId,
    textSafe: String(it.textSafe ?? it.text ?? "").slice(0, 500),
    createdAt: it.createdAt,
  }));
}
