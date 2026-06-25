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
  /** Live caption while speaking — interim + committed text */
  onInterim?: (text: string) => void;
  /** Fired only when a speech segment is finalized (isFinal) */
  onFinal?: (text: string) => void;
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

const DEFAULT_SILENCE_MS = 2_400;
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
    onFinal,
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
  let lastDisplay = "";
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

  const bestTranscript = () => {
    const merged = sanitizeSpeechTranscript(
      (lastDisplay || committedFinal).trim()
    );
    if (!merged) return null;
    if (
      committedFinal.trim() &&
      merged.length < committedFinal.trim().length
    ) {
      return sanitizeSpeechTranscript(committedFinal.trim()) || null;
    }
    return merged;
  };

  const scheduleSilenceStop = () => {
    const candidate = bestTranscript();
    if (!candidate) return;
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (active) finish(bestTranscript());
    }, silenceMs);
  };

  let restartCount = 0;
  const MAX_RESTARTS = 4;

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
      const { finalDelta, interim, hadFinal } = rebuildSpeechTranscript(event);
      if (finalDelta) {
        committedFinal = sanitizeSpeechTranscript(
          `${committedFinal} ${finalDelta}`.trim()
        );
        onFinal?.(committedFinal);
      }
      const display = sanitizeSpeechTranscript(
        interim ? `${committedFinal} ${interim}`.trim() : committedFinal
      );
      if (display) {
        lastDisplay = display;
        onInterim?.(display);
      }
      if (hadFinal) scheduleSilenceStop();
    };

    instance.onerror = (ev) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      if (ev.error === "not-allowed") finish(null);
    };

    instance.onend = () => {
      if (!active || resolved) return;
      if (bestTranscript()) {
        scheduleSilenceStop();
        return;
      }
      if (restartCount >= MAX_RESTARTS) {
        finish(null);
        return;
      }
      restartCount += 1;
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
    finish(bestTranscript());
  }, maxMs);

  try {
    rec.start();
  } catch {
    finish(null);
  }

  const stop = () => {
    if (resolved) return;
    finish(bestTranscript());
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
