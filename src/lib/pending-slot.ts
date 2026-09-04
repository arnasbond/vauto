/**
 * Chat pending-slot state — one deterministic marker that a missing-field
 * question is OPEN and the NEXT user reply must bind to the sell flow
 * instead of being classified as a global intent (F12 intent-lock).
 *
 * Lifecycle:
 *  - activatePendingSlot(field)  — when the assistant asks about a field;
 *  - getPendingSlot()            — consulted by the input router;
 *  - consumePendingSlot()        — the answer was bound; slot released;
 *  - clearPendingSlot()          — session reset / navigation.
 *
 * Client-side, session-lifetime only (dies with the tab; the draft itself is
 * the durable state).
 */

export type PendingSlotField =
  | "title"
  | "category"
  | "condition"
  | "price"
  | "city"
  | "phone"
  | "photo";

export interface PendingSlot {
  field: PendingSlotField;
  /** Monotonic id so stale consumers can discard late answers. */
  turnId: number;
}

let currentSlot: PendingSlot | null = null;
let turnCounter = 0;

export function activatePendingSlot(field: PendingSlotField): PendingSlot {
  turnCounter += 1;
  currentSlot = { field, turnId: turnCounter };
  return currentSlot;
}

export function getPendingSlot(): PendingSlot | null {
  return currentSlot;
}

export function consumePendingSlot(turnId?: number): PendingSlot | null {
  if (!currentSlot) return null;
  if (turnId !== undefined && turnId !== currentSlot.turnId) return null;
  const slot = currentSlot;
  currentSlot = null;
  return slot;
}

export function clearPendingSlot(): void {
  currentSlot = null;
}

/** Read-only: does an open slot exist for the given field? */
export function hasPendingSlot(field?: PendingSlotField): boolean {
  if (!currentSlot) return false;
  if (field === undefined) return true;
  return currentSlot.field === field;
}
