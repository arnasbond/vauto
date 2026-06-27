import { sanitizeSpeechTranscript } from "@/lib/speech-transcript";

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
  /** Live caption while speaking — interim preview only */
  onInterim?: (text: string) => void;
  /** Fired when a finalized speech segment is committed */
  onFinal?: (text: string) => void;
  onStart?: () => void;
  /** Stop after this much silence once we have text (only if no final yet) */
  silenceMs?: number;
  maxMs?: number;
  /** Finish session immediately after first finalized segment */
  stopOnFinal?: boolean;
}

export interface VoiceSearchSession {
  promise: Promise<string | null>;
  stop: () => void;
  cancel: () => void;
}

const DEFAULT_SILENCE_MS = 2_000;
const DEFAULT_MAX_MS = 25_000;

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
    stopOnFinal = false,
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
  let started = false;
  let closingAfterFinal = false;
  const seenFinalIndices = new Set<number>();

  const clearTimers = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    if (maxTimer) clearTimeout(maxTimer);
    silenceTimer = null;
    maxTimer = null;
  };

  let resolvePromise: (value: string | null) => void = () => {};
  const promise = new Promise<string | null>((resolve) => {
    resolvePromise = resolve;
  });

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

  const stopRecognitionCleanly = () => {
    closingAfterFinal = true;
    active = false;
    clearTimers();
    try {
      rec?.stop();
    } catch {
      /* ignore */
    }
  };

  const scheduleSilenceStop = () => {
    const candidate = sanitizeSpeechTranscript(committedFinal.trim());
    if (!candidate) return;
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (active && !resolved) {
        stopRecognitionCleanly();
        finish(candidate);
      }
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
      let interimText = "";
      let gotNewFinal = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const part = (result?.[0]?.transcript ?? "").trim();
        if (!part) continue;

        if (result.isFinal) {
          if (!seenFinalIndices.has(i)) {
            seenFinalIndices.add(i);
            committedFinal = sanitizeSpeechTranscript(
              committedFinal ? `${committedFinal} ${part}` : part
            );
            gotNewFinal = true;
          }
        } else {
          interimText = interimText ? `${interimText} ${part}` : part;
        }
      }

      if (gotNewFinal && committedFinal) {
        onFinal?.(committedFinal);
        if (stopOnFinal) {
          stopRecognitionCleanly();
          finish(committedFinal);
          return;
        }
        scheduleSilenceStop();
      }

      if (interimText) {
        const preview = sanitizeSpeechTranscript(
          committedFinal ? `${committedFinal} ${interimText}` : interimText
        );
        onInterim?.(preview);
      } else if (committedFinal) {
        onInterim?.(committedFinal);
      }
    };

    instance.onerror = (ev) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      if (ev.error === "not-allowed") finish(null);
    };

    instance.onend = () => {
      if (resolved || closingAfterFinal) {
        if (!resolved && committedFinal.trim()) {
          finish(sanitizeSpeechTranscript(committedFinal.trim()));
        }
        return;
      }
      if (!active) return;
      if (committedFinal.trim()) {
        scheduleSilenceStop();
        return;
      }
      finish(null);
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
    stopRecognitionCleanly();
    finish(sanitizeSpeechTranscript(committedFinal.trim()) || null);
  };

  const cancel = () => {
    if (resolved) return;
    resolved = true;
    active = false;
    closingAfterFinal = true;
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
