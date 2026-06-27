import { Capacitor } from "@capacitor/core";
import {
  createVoiceSession,
  type VoiceSession,
} from "@/lib/audio-session";
import { buildSpeechTranscriptFromResults, sanitizeSpeechTranscript } from "@/lib/speech-transcript";

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

/** Visually hidden but still activatable on iOS/Android (never display:none). */
export const NATIVE_FILE_INPUT_CLASS = "native-file-input";

function styleTransientFileInput(input: HTMLInputElement) {
  input.style.position = "fixed";
  input.style.top = "0";
  input.style.left = "0";
  input.style.width = "1px";
  input.style.height = "1px";
  input.style.opacity = "0.01";
  input.style.overflow = "hidden";
}

function mountTransientMultiFileInput(
  configure: (input: HTMLInputElement) => void
): Promise<File[]> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve([]);
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    styleTransientFileInput(input);
    configure(input);

    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", onWindowFocus);
      window.setTimeout(() => input.remove(), 300);
      resolve(files);
    };

    const onWindowFocus = () => {
      window.setTimeout(() => {
        if (!input.files?.length) finish([]);
      }, 400);
    };

    input.addEventListener("change", () => {
      finish(Array.from(input.files ?? []));
    });

    document.body.appendChild(input);
    window.addEventListener("focus", onWindowFocus, { once: true });
    input.click();
  });
}

function mountTransientFileInput(
  configure: (input: HTMLInputElement) => void
): Promise<File | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    styleTransientFileInput(input);
    configure(input);

    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", onWindowFocus);
      window.setTimeout(() => input.remove(), 300);
      resolve(file);
    };

    const onWindowFocus = () => {
      window.setTimeout(() => {
        if (!input.files?.length) finish(null);
      }, 400);
    };

    input.addEventListener("change", () => {
      finish(input.files?.[0] ?? null);
    });

    document.body.appendChild(input);
    window.addEventListener("focus", onWindowFocus, { once: true });
    input.click();
  });
}

async function fileToCapturedPhoto(file: File): Promise<CapturedPhoto | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        resolve(null);
        return;
      }
      void normalizeCapturedPhoto({
        dataUrl: reader.result,
        fileName: file.name,
      }).then(resolve);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
async function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

function ensureDataUrlPrefix(dataUrl: string, format = "jpeg"): string {
  const trimmed = dataUrl.trim();
  if (trimmed.startsWith("data:image")) return trimmed;
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed.slice(0, 64))) {
    return `data:image/${format};base64,${trimmed.replace(/\s/g, "")}`;
  }
  return trimmed;
}

/** Convert Capacitor/local URIs into uploadable data URLs. */
export async function resolveImageForUpload(src: string): Promise<string | null> {
  const trimmed = src.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:image")) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  if (Capacitor.isNativePlatform()) {
    try {
      const { Capacitor: Cap } = await import("@capacitor/core");
      const fetchUri = trimmed.startsWith("capacitor://") || trimmed.startsWith("file://")
        ? trimmed
        : Cap.convertFileSrc(trimmed);
      const res = await fetch(fetchUri);
      if (res.ok) {
        const blob = await res.blob();
        return blobToDataUrl(blob);
      }
    } catch {
      /* fall through */
    }
  }

  try {
    const res = await fetch(trimmed);
    if (!res.ok) return null;
    const blob = await res.blob();
    return blobToDataUrl(blob);
  } catch {
    return null;
  }
}

async function normalizeCapturedPhoto(photo: CapturedPhoto): Promise<CapturedPhoto> {
  let dataUrl = ensureDataUrlPrefix(photo.dataUrl);
  if (!dataUrl.startsWith("data:image") && photo.fileName) {
    const resolved = await resolveImageForUpload(photo.fileName);
    if (resolved) dataUrl = resolved;
  }
  dataUrl = await compressDataUrl(dataUrl, {
    maxDim: Capacitor.isNativePlatform() ? 1280 : 1280,
    maxChars: 400_000,
    force: Capacitor.isNativePlatform(),
  });
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
  source: PhotoPickSource = "camera"
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

    try {
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: cameraSource,
        promptLabelHeader: "Nuotrauka",
        promptLabelPhoto: "Galerija",
        promptLabelPicture: "Fotografuoti",
      });

      if (!photo.dataUrl && photo.webPath) {
        const fromWebPath = await resolveImageForUpload(photo.webPath);
        if (fromWebPath) {
          return normalizeCapturedPhoto({
            dataUrl: fromWebPath,
            fileName: photo.path?.split("/").pop(),
          });
        }
      }

      if (!photo.dataUrl) return null;
      return normalizeCapturedPhoto({
        dataUrl: photo.dataUrl,
        fileName: photo.path?.split("/").pop() ?? photo.webPath,
      });
    } catch {
      return null;
    }
  }

  const pick = source;
  if (pick === "prompt") {
    return pickPhotoSourceOnWeb();
  }

  return pickFileAsDataUrl(
    "image/*",
    pick === "camera" ? "environment" : undefined
  );
}

async function pickFileAsDataUrl(
  accept: string,
  capture?: "user" | "environment"
): Promise<CapturedPhoto | null> {
  const file = await mountTransientFileInput((input) => {
    input.accept = accept;
    if (capture) input.setAttribute("capture", capture);
  });
  if (!file) return null;
  return fileToCapturedPhoto(file);
}

async function pickFilesAsDataUrls(
  accept: string,
  maxCount: number
): Promise<CapturedPhoto[]> {
  const files = await mountTransientMultiFileInput((input) => {
    input.accept = accept;
    input.multiple = true;
  });
  if (!files.length) return [];

  const captured = await Promise.all(
    files.slice(0, maxCount).map((file) => fileToCapturedPhoto(file))
  );
  return captured.filter((x): x is CapturedPhoto => x !== null);
}

/** Web: open rear camera inside the current tap gesture. */
export async function pickCameraPhotoWeb(): Promise<CapturedPhoto | null> {
  return pickFileInUserGesture("environment");
}

/** Web: open gallery picker (no capture attribute). */
export async function pickGalleryPhotoWeb(): Promise<CapturedPhoto | null> {
  return pickFileInUserGesture();
}

/** Open file input synchronously inside the current tap (required for mobile camera). */
function pickFileInUserGesture(
  capture?: "user" | "environment"
): Promise<CapturedPhoto | null> {
  if (typeof document === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    styleTransientFileInput(input);
    if (capture) input.setAttribute("capture", capture);

    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", onWindowFocus);
      window.setTimeout(() => input.remove(), 300);
      if (!file) {
        resolve(null);
        return;
      }
      void fileToCapturedPhoto(file).then(resolve);
    };

    const onWindowFocus = () => {
      window.setTimeout(() => {
        if (!input.files?.length) finish(null);
      }, 400);
    };

    input.addEventListener("change", () => {
      finish(input.files?.[0] ?? null);
    });

    document.body.appendChild(input);
    window.addEventListener("focus", onWindowFocus, { once: true });
    input.click();
  });
}

/** Web-only sheet: Fotografuoti arba Galerija — file input starts inside button tap. */
function pickPhotoSourceOnWeb(): Promise<CapturedPhoto | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }

    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.className =
      "fixed inset-0 z-[10002] flex items-end justify-center bg-black/60 p-4";

    const panel = document.createElement("div");
    panel.className =
      "w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl";

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

    const finish = (photo: CapturedPhoto | null) => {
      overlay.remove();
      resolve(photo);
    };

    cameraBtn.onclick = () => {
      void pickFileInUserGesture("environment").then(finish);
    };
    galleryBtn.onclick = () => {
      void pickFileInUserGesture().then(finish);
    };
    cancelBtn.onclick = () => finish(null);
    overlay.onclick = (e) => {
      if (e.target === overlay) finish(null);
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
    let currentTranscript = "";
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
      if (!currentTranscript.trim()) return;
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(
        () => finish(sanitizeSpeechTranscript(currentTranscript.trim()) || null),
        2_000
      );
    };

    const maxTimeout = setTimeout(() => {
      finish(sanitizeSpeechTranscript(currentTranscript.trim()) || null);
    }, 20_000);

    rec.onresult = (event) => {
      currentTranscript = buildSpeechTranscriptFromResults(event.results);
      if (currentTranscript) scheduleSilence();
    };
    rec.onerror = (ev: { error: string }) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      if (ev.error === "not-allowed") finish(null);
    };
    rec.onend = () => {
      if (!resolved && currentTranscript.trim()) {
        finish(sanitizeSpeechTranscript(currentTranscript.trim()));
      }
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
