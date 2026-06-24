import { Capacitor } from "@capacitor/core";
import { hasOpenAiKey } from "@/lib/openai-settings";
import {
  createVoiceSession,
  transcribeFromSession,
  type VoiceSession,
} from "@/lib/audio-session";
import { rebuildSpeechTranscript, sanitizeSpeechTranscript } from "@/lib/speech-transcript";

export interface CapturedPhoto {
  dataUrl: string;
  fileName?: string;
}

/** Always resize for AI vision API (faster upload, fewer timeouts). */
export async function compressForAiVision(dataUrl: string): Promise<string> {
  return compressDataUrl(dataUrl, {
    maxDim: 1024,
    quality: 0.78,
    maxChars: 150_000,
    force: true,
  });
}

/** Resize/compress web images before upload (keeps under ~400KB). */
export async function compressDataUrl(
  dataUrl: string,
  opts?: { maxDim?: number; quality?: number; maxChars?: number; force?: boolean }
): Promise<string> {
  if (typeof document === "undefined" || !dataUrl.startsWith("data:image")) {
    return dataUrl;
  }
  const maxDim = opts?.maxDim ?? 1280;
  const maxChars = opts?.maxChars ?? 400_000;
  const force = opts?.force ?? false;
  if (!force && dataUrl.length <= maxChars) return dataUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height, 1));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      let quality = opts?.quality ?? 0.82;
      let out = canvas.toDataURL("image/jpeg", quality);
      while (out.length > maxChars && quality > 0.45) {
        quality -= 0.08;
        out = canvas.toDataURL("image/jpeg", quality);
      }
      resolve(out);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function normalizeCapturedPhoto(photo: CapturedPhoto): Promise<CapturedPhoto> {
  if (Capacitor.isNativePlatform()) return photo;
  const dataUrl = await compressDataUrl(photo.dataUrl);
  return { ...photo, dataUrl };
}

export type PhotoPickSource = "camera" | "gallery" | "prompt";

/** Capture from a known source (no web prompt sheet — use PhotoSourceSheet in React UI). */
export async function capturePhotoFromSource(
  source: "camera" | "gallery"
): Promise<CapturedPhoto | null> {
  return capturePhoto(source);
}

/** Pick multiple images from gallery (web multi-select; native picks one at a time). */
export async function pickMultipleFromGallery(
  maxCount: number
): Promise<CapturedPhoto[]> {
  if (maxCount <= 0) return [];

  if (Capacitor.isNativePlatform()) {
    const one = await capturePhoto("gallery");
    return one ? [one] : [];
  }

  return pickFilesAsDataUrls("image/*", maxCount);
}

/** Pick or capture a photo — Capacitor Camera on native, camera/gallery choice on web */
export async function capturePhoto(
  source: PhotoPickSource = "prompt"
): Promise<CapturedPhoto | null> {
  if (Capacitor.isNativePlatform()) {
    const { Camera, CameraResultType, CameraSource } = await import(
      "@capacitor/camera"
    );

    const perm = await Camera.checkPermissions();
    if (perm.camera !== "granted" || perm.photos !== "granted") {
      await Camera.requestPermissions({ permissions: ["camera", "photos"] });
    }

    const cameraSource =
      source === "camera"
        ? CameraSource.Camera
        : source === "gallery"
          ? CameraSource.Photos
          : CameraSource.Prompt;

    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: cameraSource,
      promptLabelHeader: "Nuotrauka",
      promptLabelPhoto: "Galerija",
      promptLabelPicture: "Fotografuoti",
    });

    if (!photo.dataUrl) return null;
    return normalizeCapturedPhoto({
      dataUrl: photo.dataUrl,
      fileName: photo.path?.split("/").pop(),
    });
  }

  let pick = source;
  if (pick === "prompt") {
    const chosen = await pickPhotoSourceOnWeb();
    if (!chosen) return null;
    pick = chosen;
  }

  return pickFileAsDataUrl(
    "image/*",
    pick === "camera" ? "environment" : undefined
  );
}

function pickFileAsDataUrl(
  accept: string,
  capture?: "user" | "environment"
): Promise<CapturedPhoto | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    if (capture) input.setAttribute("capture", capture);
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        void normalizeCapturedPhoto({
          dataUrl: reader.result as string,
          fileName: file.name,
        }).then(resolve);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

function pickFilesAsDataUrls(
  accept: string,
  maxCount: number
): Promise<CapturedPhoto[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = true;
    input.onchange = () => {
      const files = Array.from(input.files ?? []).slice(0, maxCount);
      if (!files.length) {
        resolve([]);
        return;
      }
      Promise.all(
        files.map(
          (file) =>
            new Promise<CapturedPhoto | null>((res) => {
              const reader = new FileReader();
              reader.onload = () => {
                void normalizeCapturedPhoto({
                  dataUrl: reader.result as string,
                  fileName: file.name,
                }).then(res);
              };
              reader.onerror = () => res(null);
              reader.readAsDataURL(file);
            })
        )
      ).then((items) => resolve(items.filter((x): x is CapturedPhoto => x !== null)));
    };
    input.click();
  });
}

/** Web-only sheet: fotografuoti arba galerija */
function pickPhotoSourceOnWeb(): Promise<"camera" | "gallery" | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }

    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.className =
      "fixed inset-0 z-[300] flex items-end justify-center bg-black/60 p-4";

    const panel = document.createElement("div");
    panel.className =
      "w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl animate-in";

    const title = document.createElement("p");
    title.className =
      "mb-3 text-center text-sm font-semibold text-[#111827]";
    title.textContent = "Kaip įkelti nuotrauką?";

    const cameraBtn = document.createElement("button");
    cameraBtn.type = "button";
    cameraBtn.className =
      "mb-2 w-full rounded-xl bg-[#1167b1] py-3.5 text-sm font-semibold text-white";
    cameraBtn.textContent = "Fotografuoti";

    const galleryBtn = document.createElement("button");
    galleryBtn.type = "button";
    galleryBtn.className =
      "mb-2 w-full rounded-xl border border-[#dde5ef] py-3.5 text-sm font-semibold text-[#111827]";
    galleryBtn.textContent = "Pasirinkti iš galerijos";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "w-full py-2 text-sm text-[#6b7280]";
    cancelBtn.textContent = "Atšaukti";

    const cleanup = (value: "camera" | "gallery" | null) => {
      overlay.remove();
      resolve(value);
    };

    cameraBtn.onclick = () => cleanup("camera");
    galleryBtn.onclick = () => cleanup("gallery");
    cancelBtn.onclick = () => cleanup(null);
    overlay.onclick = (e) => {
      if (e.target === overlay) cleanup(null);
    };

    panel.append(title, cameraBtn, galleryBtn, cancelBtn);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  });
}

type SpeechRecognitionCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((e: {
        resultIndex: number;
        results: {
          length: number;
          [i: number]: { [j: number]: { transcript: string }; isFinal: boolean };
        };
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

async function speechRecognitionTranscript(): Promise<string | null> {
  const SpeechRecognition = getSpeechRecognition();
  if (!SpeechRecognition) return null;

  return new Promise((resolve) => {
    const rec = new SpeechRecognition();
    rec.lang = "lt-LT";
    rec.continuous = true;
    rec.interimResults = true;

    let resolved = false;
    let committed = "";
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (text: string | null) => {
      if (resolved) return;
      resolved = true;
      if (silenceTimer) clearTimeout(silenceTimer);
      clearTimeout(maxTimeout);
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      resolve(text);
    };

    const scheduleSilence = () => {
      if (!committed.trim()) return;
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => finish(committed.trim() || null), 2_500);
    };

    const maxTimeout = setTimeout(() => {
      finish(committed.trim() || null);
    }, 20_000);

    rec.onresult = (event) => {
      const { final, combined } = rebuildSpeechTranscript(event);
      committed = final;
      if (combined) scheduleSilence();
    };
    rec.onerror = (ev: { error: string }) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      if (ev.error === "not-allowed") finish(null);
    };
    rec.onend = () => {
      if (!resolved && committed.trim()) finish(sanitizeSpeechTranscript(committed.trim()));
    };

    try {
      rec.start();
    } catch {
      finish(null);
    }
  });
}

const DEMO_TRANSCRIPT = "Parduodu maišą obuolių, dešimt eurų, Kaune";

/** @deprecated Demo transcript no longer injected silently — kept for tests only */
export const VAUTO_DEMO_VOICE_TRANSCRIPT = DEMO_TRANSCRIPT;

/**
 * Record voice → transcript using a shared session (for reactive UI).
 * Caller must session.release() when done.
 */
export async function recordWithSession(
  session: VoiceSession
): Promise<string | null> {
  if (hasOpenAiKey()) {
    try {
      const text = await transcribeFromSession(session);
      if (text) return text;
    } catch (e) {
      console.warn("[Vauto] Whisper failed:", e);
    }
  }

  session.release();
  const speech = await speechRecognitionTranscript();
  if (speech) return speech;

  return null;
}

/**
 * Record voice → transcript (creates & releases session internally).
 */
export async function recordVoiceTranscript(): Promise<string | null> {
  const session = await createVoiceSession();
  if (!session) {
    const speech = await speechRecognitionTranscript();
    return speech;
  }

  try {
    return await recordWithSession(session);
  } finally {
    session.release();
  }
}

export async function listenForSearchQuery(): Promise<string | null> {
  return recordVoiceTranscript();
}

export { createVoiceSession, type VoiceSession };
