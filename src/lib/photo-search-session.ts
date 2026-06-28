import { compressForAiVision, type CapturedPhoto } from "@/lib/native-media";

const STORAGE_KEY = "vauto:photo-search-session";
const MAX_AGE_MS = 30 * 60 * 1000;
const MAX_STORE_CHARS = 1_800_000;

export interface PhotoSearchSession {
  dataUrl: string;
  fileName?: string;
  extraContext?: string;
  savedAt: number;
}

export function loadPhotoSearchSession(): PhotoSearchSession | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PhotoSearchSession;
    if (!parsed?.dataUrl || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function persistPhotoSearchSession(
  photo: CapturedPhoto,
  extraContext?: string
): Promise<void> {
  if (typeof sessionStorage === "undefined") return;
  try {
    const compressed = await compressForAiVision(photo.dataUrl);
    if (compressed.length > MAX_STORE_CHARS) return;
    const payload: PhotoSearchSession = {
      dataUrl: compressed,
      fileName: photo.fileName,
      extraContext: extraContext?.trim() || undefined,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota or serialization — in-memory state still applies */
  }
}

export function clearPhotoSearchSession(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function sessionToCapturedPhoto(
  session: PhotoSearchSession
): CapturedPhoto {
  return {
    dataUrl: session.dataUrl,
    fileName: session.fileName,
  };
}
