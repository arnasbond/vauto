import type { PendingPhotoIntent } from "@/lib/photo-intent-resolution";

let pending: PendingPhotoIntent | null = null;

export function setPendingPhotoIntent(session: PendingPhotoIntent): void {
  pending = session;
}

export function peekPendingPhotoIntent(): PendingPhotoIntent | null {
  return pending;
}

export function consumePendingPhotoIntent(): PendingPhotoIntent | null {
  const hit = pending;
  pending = null;
  return hit;
}

export function clearPendingPhotoIntent(): void {
  pending = null;
}
