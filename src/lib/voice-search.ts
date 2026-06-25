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

const DEFAULT_SILENCE_MS = 1_500;
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
    let resolved = false;
    let resolvePromise: (value: string | null) => void = () => {};
    const promise = new Promise<string | null>((resolve) => {
      resolvePromise = resolve;
    });
    const finish = (value: string | null) => {
      if (resolved) return;
      resolved = true;
      resolvePromise(value);
    };
    return {
      promise,
      stop: () => finish(null),
      cancel: () => finish(null),
    };
  }

  let active = true;
  let resolved = false;
  let rec: InstanceType<SpeechRecognitionCtor> | null = null;
  let committedFinal = "";
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
    if (!committedFinal.trim()) return;
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (active && committedFinal.trim())
        finish(sanitizeSpeechTranscript(committedFinal.trim()) || null);
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
      const { final, interim } = rebuildSpeechTranscript(event);
      if (final) {
        committedFinal = sanitizeSpeechTranscript(
          `${committedFinal} ${final}`.trim()
        );
      }
      const display = sanitizeSpeechTranscript(
        interim ? `${committedFinal} ${interim}`.trim() : committedFinal
      );
      if (display) onInterim?.(display);
      if (final) scheduleSilenceStop();
    };

    instance.onerror = (ev) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      if (ev.error === "not-allowed") finish(null);
    };

    instance.onend = () => {
      if (!active || resolved) return;
      if (committedFinal.trim()) {
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
    finish(sanitizeSpeechTranscript(committedFinal.trim()) || null);
  }, maxMs);

  try {
    rec.start();
  } catch {
    finish(null);
  }

  const stop = () => {
    if (resolved) return;
    finish(sanitizeSpeechTranscript(committedFinal.trim()) || null);
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

export function isVoiceSearchSupported(): boolean {
  if (getSpeechRecognition()) return true;
  if (typeof navigator === "undefined") return false;
  return Boolean(navigator.mediaDevices?.getUserMedia);
}
