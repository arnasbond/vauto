import { Capacitor } from "@capacitor/core";
import { hasOpenAiKey } from "@/lib/openai-settings";
import {
  createVoiceSession,
  transcribeFromSession,
  type VoiceSession,
} from "@/lib/audio-session";

/** Pick or capture a photo — Capacitor Camera on native, file input on web */
export async function capturePhoto(): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    const { Camera, CameraResultType, CameraSource } = await import(
      "@capacitor/camera"
    );

    const perm = await Camera.checkPermissions();
    if (perm.camera !== "granted" || perm.photos !== "granted") {
      await Camera.requestPermissions({ permissions: ["camera", "photos"] });
    }

    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Prompt,
      promptLabelHeader: "Nuotrauka",
      promptLabelPhoto: "Galerija",
      promptLabelPicture: "Kamera",
    });

    return photo.dataUrl ?? null;
  }

  return pickFileAsDataUrl("image/*");
}

function pickFileAsDataUrl(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

type SpeechRecognitionCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((e: {
        results: { [i: number]: { [j: number]: { transcript: string } } };
      }) => void)
    | null;
  onerror: (() => void) | null;
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
    rec.continuous = false;
    rec.interimResults = false;

    let resolved = false;
    const finish = (text: string | null) => {
      if (resolved) return;
      resolved = true;
      resolve(text);
    };

    const timeout = setTimeout(() => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      finish(null);
    }, 12000);

    rec.onresult = (event) => {
      clearTimeout(timeout);
      finish(event.results[0]?.[0]?.transcript?.trim() || null);
    };
    rec.onerror = () => {
      clearTimeout(timeout);
      finish(null);
    };
    rec.onend = () => {
      clearTimeout(timeout);
      if (!resolved) finish(null);
    };

    try {
      rec.start();
    } catch {
      finish(null);
    }
  });
}

const DEMO_TRANSCRIPT = "Parduodu maišą obuolių, dešimt eurų, Panevėžyje";

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
