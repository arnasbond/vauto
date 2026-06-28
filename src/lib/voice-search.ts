import {
  handleSpeechRecognitionResult,
  sanitizeSpeechTranscript,
  teardownSpeechRecognition,
  VOICE_SILENCE_DEBOUNCE_MS,
} from "@/lib/speech-transcript";
import {
  detectSpokenLocale,
  ensureSpeechVoicesReady,
  getLockedSttLang,
  lockSessionLocale,
} from "@/lib/SpeechEngine";
import { ensureNativeMicrophonePermission } from "@/lib/native-mic-permission";

type SpeechResults = {
  length: number;
  [i: number]: { [j: number]: { transcript: string }; isFinal: boolean };
};

type SpeechRecognitionCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult:
    | ((e: { resultIndex: number; results: SpeechResults }) => void)
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
  /** Live caption — latest hypothesis only */
  onInterim?: (text: string) => void;
  onStart?: () => void;
  silenceMs?: number;
  maxMs?: number;
}

export interface VoiceSearchSession {
  promise: Promise<string | null>;
  stop: () => void;
  cancel: () => void;
}

const DEFAULT_SILENCE_MS = VOICE_SILENCE_DEBOUNCE_MS;
const DEFAULT_MAX_MS = 25_000;

let activeVoiceSession: VoiceSearchSession | null = null;

/** Abort any in-flight voice search session (e.g. before sending chat message). */
export function cancelActiveVoiceSearch(): void {
  activeVoiceSession?.cancel();
  activeVoiceSession = null;
}

/**
 * Flush WebKit SpeechRecognition state after a completed chat turn — not before recording.
 */
export function recycleSpeechRecognitionEngine(): Promise<void> {
  cancelActiveVoiceSearch();
  const SpeechRecognition = getSpeechRecognition();
  if (!SpeechRecognition) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    try {
      const rec = new SpeechRecognition();
      rec.lang = getLockedSttLang();
      rec.continuous = false;
      rec.interimResults = false;
      rec.onend = finish;
      rec.onerror = finish;
      try {
        rec.start();
      } catch {
        finish();
        return;
      }
      window.setTimeout(() => {
        try {
          rec.stop();
        } catch {
          finish();
        }
      }, 80);
      window.setTimeout(finish, 400);
    } catch {
      finish();
    }
  });
}

/**
 * Continuous SpeechRecognition with manual end via silence debounce.
 * Android WebView: continuous=true keeps the mic open mid-sentence; stop() ends cleanly.
 */
export function startVoiceSearch(
  options: VoiceSearchOptions = {}
): VoiceSearchSession {
  cancelActiveVoiceSearch();

  const {
    onInterim,
    onStart,
    silenceMs = DEFAULT_SILENCE_MS,
    maxMs = DEFAULT_MAX_MS,
  } = options;

  let resolved = false;
  let rec: InstanceType<SpeechRecognitionCtor> | null = null;
  let stopFn: () => void = () => {};
  let cancelFn: () => void = () => {};

  const promise = (async (): Promise<string | null> => {
    const micOk = await ensureNativeMicrophonePermission();
    if (!micOk) return null;

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return null;

    return new Promise<string | null>((resolve) => {
      let committedFinal = "";
      let latestHypothesis = "";
      let silenceTimeout: ReturnType<typeof setTimeout> | null = null;
      let maxTimer: ReturnType<typeof setTimeout> | null = null;
      let started = false;
      let stopping = false;
      let heardSpeech = false;

      lockSessionLocale("lt-LT");
      void ensureSpeechVoicesReady();

      const clearTimers = () => {
        if (silenceTimeout) clearTimeout(silenceTimeout);
        if (maxTimer) clearTimeout(maxTimer);
        silenceTimeout = null;
        maxTimer = null;
      };

      const bestTranscript = () =>
        (committedFinal.trim() || latestHypothesis.trim()).trim();

      const deliverOnce = (text: string | null) => {
        if (resolved) return;
        resolved = true;
        stopping = true;
        clearTimers();
        teardownSpeechRecognition(rec);
        rec = null;
        onInterim?.("");
        resolve(text?.trim() ? sanitizeSpeechTranscript(text.trim()) : null);
      };

      const requestStop = () => {
        if (resolved || stopping) return;
        stopping = true;
        clearTimers();
        try {
          rec?.stop();
        } catch {
          deliverOnce(bestTranscript() || null);
        }
      };

      /** Reset silence debounce on every new STT hypothesis — manual end only after pause. */
      const resetSilenceDebounce = () => {
        if (silenceTimeout) clearTimeout(silenceTimeout);
        silenceTimeout = setTimeout(() => {
          const payload = bestTranscript();
          if (payload) requestStop();
          else deliverOnce(null);
        }, silenceMs);
      };

      stopFn = () => {
        clearTimers();
        if (bestTranscript()) requestStop();
        else deliverOnce(null);
      };

      cancelFn = () => {
        if (resolved) return;
        stopping = true;
        clearTimers();
        teardownSpeechRecognition(rec);
        rec = null;
        onInterim?.("");
        resolved = true;
        resolve(null);
      };

      rec = new SpeechRecognition();
      rec.lang = getLockedSttLang();
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        committedFinal = "";
        latestHypothesis = "";
        heardSpeech = false;
        onInterim?.("");
        if (!started) {
          started = true;
          onStart?.();
        }
      };

      rec.onresult = (event) => {
        const { isFinal, text } = handleSpeechRecognitionResult(event, {
          setInputValue: (value) => {
            committedFinal = value;
            latestHypothesis = value;
          },
          setInterimCaption: (value) => {
            latestHypothesis = value;
            onInterim?.(value);
          },
          onFinalTranscript: (value) => {
            committedFinal = value;
            latestHypothesis = value;
            onInterim?.("");
            resetSilenceDebounce();
          },
        });

        if (text.trim()) {
          heardSpeech = true;
          if (!isFinal) latestHypothesis = text;
          detectSpokenLocale(text);
          resetSilenceDebounce();
        }
      };

      rec.onerror = (ev) => {
        if (ev.error === "aborted") return;
        if (ev.error === "no-speech") {
          /** Ignore idle no-speech bursts — silence debounce / max timer owns session end. */
          if (!heardSpeech && !bestTranscript()) return;
          return;
        }
        if (ev.error === "not-allowed") {
          deliverOnce(null);
          return;
        }
        deliverOnce(bestTranscript() || null);
      };

      rec.onend = () => {
        if (resolved) return;
        /** Safe exit — no reload loop when user stayed silent or stop() completed normally. */
        deliverOnce(bestTranscript() || null);
      };

      maxTimer = setTimeout(() => {
        if (bestTranscript()) requestStop();
        else deliverOnce(null);
      }, maxMs);

      try {
        rec.start();
      } catch {
        deliverOnce(null);
      }
    });
  })();

  const session: VoiceSearchSession = {
    promise: promise.finally(() => {
      if (activeVoiceSession === session) activeVoiceSession = null;
    }),
    stop: () => stopFn(),
    cancel: () => cancelFn(),
  };

  activeVoiceSession = session;
  return session;
}

export function isVoiceSearchSupported(): boolean {
  if (getSpeechRecognition()) return true;
  if (typeof navigator === "undefined") return false;
  return Boolean(navigator.mediaDevices?.getUserMedia);
}
