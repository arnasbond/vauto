import { rebuildSpeechTranscript, sanitizeSpeechTranscript } from "@/lib/speech-transcript";

type SpeechRecognitionCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
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
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface VoiceSearchOptions {
  onInterim?: (text: string) => void;
  onStart?: () => void;
  /** Stop after this much silence once we have text */
  silenceMs?: number;
  maxMs?: number;
}

export interface VoiceSearchSession {
  promise: Promise<string | null>;
  stop: () => void;
  cancel: () => void;
}

const DEFAULT_SILENCE_MS = 2_800;
const DEFAULT_MAX_MS = 25_000;
const RESTART_DELAY_MS = 350;

/**
 * Mobile-friendly voice search — single SpeechRecognition stream (no MediaRecorder conflict).
 */
export function startVoiceSearch(
  options: VoiceSearchOptions = {}
): VoiceSearchSession {
  const {
    onInterim,
    onStart,
    silenceMs = DEFAULT_SILENCE_MS,
    maxMs = DEFAULT_MAX_MS,
  } = options;

  const SpeechRecognition = getSpeechRecognition();
  if (!SpeechRecognition) {
    return startWhisperVoiceSearch(options);
  }

  let active = true;
  let resolved = false;
  let rec: InstanceType<SpeechRecognitionCtor> | null = null;
  let committed = "";
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let started = false;

  const clearTimers = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    if (maxTimer) clearTimeout(maxTimer);
    if (restartTimer) clearTimeout(restartTimer);
    silenceTimer = null;
    maxTimer = null;
    restartTimer = null;
  };

  const finish = (text: string | null) => {
    if (resolved) return;
    resolved = true;
    active = false;
    clearTimers();
    try {
      rec?.abort();
    } catch {
      /* ignore */
    }
    rec = null;
    resolvePromise(text?.trim() || null);
  };

  let resolvePromise: (value: string | null) => void = () => {};
  const promise = new Promise<string | null>((resolve) => {
    resolvePromise = resolve;
  });

  const scheduleSilenceStop = () => {
    if (!committed.trim()) return;
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (active && committed.trim())
        finish(sanitizeSpeechTranscript(committed.trim()) || null);
    }, silenceMs);
  };

  const bindRecognition = () => {
    const instance = new SpeechRecognition();
    instance.lang = "lt-LT";
    instance.continuous = true;
    instance.interimResults = true;
    instance.maxAlternatives = 1;

    instance.onstart = () => {
      if (!started) {
        started = true;
        onStart?.();
      }
    };

    instance.onresult = (event) => {
      const { final, combined } = rebuildSpeechTranscript(event);
      committed = final;
      if (combined) onInterim?.(combined);
      if (final || combined) scheduleSilenceStop();
    };

    instance.onerror = (ev) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      if (ev.error === "not-allowed") finish(null);
    };

    instance.onend = () => {
      if (!active || resolved) return;
      if (committed.trim()) {
        scheduleSilenceStop();
        return;
      }
      restartTimer = setTimeout(() => {
        if (!active || resolved || !rec) return;
        try {
          rec.start();
        } catch {
          /* already started */
        }
      }, RESTART_DELAY_MS);
    };

    return instance;
  };

  rec = bindRecognition();
  maxTimer = setTimeout(() => {
    finish(sanitizeSpeechTranscript(committed.trim()) || null);
  }, maxMs);

  try {
    rec.start();
  } catch {
    finish(null);
  }

  const stop = () => {
    if (resolved) return;
    finish(sanitizeSpeechTranscript(committed.trim()) || null);
  };

  const cancel = () => {
    if (resolved) return;
    resolved = true;
    active = false;
    clearTimers();
    try {
      rec?.abort();
    } catch {
      /* ignore */
    }
    rec = null;
    resolvePromise(null);
  };

  return { promise, stop, cancel };
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

async function transcribeBlob(blob: Blob): Promise<string | null> {
  const { isAiProxyAvailable } = await import("@/lib/api/config");
  const { apiTranscribeAudio } = await import("@/lib/api/client");
  const { hasOpenAiKey } = await import("@/lib/openai-settings");

  if (isAiProxyAvailable()) {
    const audioBase64 = await blobToBase64(blob);
    const remote = await apiTranscribeAudio({
      audioBase64,
      mimeType: blob.type || "audio/webm",
    });
    if (remote?.text) return remote.text;
  }

  if (hasOpenAiKey()) {
    const { transcribeAudioOpenAI } = await import("@/lib/openai");
    const text = await transcribeAudioOpenAI(blob);
    return text.trim() || null;
  }

  return null;
}

/** Whisper fallback when Web Speech API is unavailable */
function startWhisperVoiceSearch(options: VoiceSearchOptions = {}): VoiceSearchSession {
  const { onStart, maxMs = DEFAULT_MAX_MS } = options;
  let cancelled = false;
  let sessionRelease: (() => void) | null = null;

  const promise = (async (): Promise<string | null> => {
    const { createVoiceSession } = await import("@/lib/audio-session");
    const session = await createVoiceSession();
    if (!session || cancelled) {
      session?.release();
      return null;
    }
    sessionRelease = session.release;
    onStart?.();
    const blob = await session.record(maxMs);
    session.release();
    sessionRelease = null;
    if (cancelled || !blob) return null;
    return transcribeBlob(blob);
  })();

  return {
    promise,
    stop: () => {
      sessionRelease?.();
      sessionRelease = null;
    },
    cancel: () => {
      cancelled = true;
      sessionRelease?.();
      sessionRelease = null;
    },
  };
}

export function isVoiceSearchSupported(): boolean {
  if (getSpeechRecognition()) return true;
  if (typeof navigator === "undefined") return false;
  return Boolean(navigator.mediaDevices?.getUserMedia);
}
