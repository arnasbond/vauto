import {
  handleSpeechRecognitionResult,
  sanitizeSpeechTranscript,
  teardownSpeechRecognition,
} from "@/lib/speech-transcript";
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

const DEFAULT_SILENCE_MS = 2_000;
const DEFAULT_MAX_MS = 25_000;

let activeVoiceSession: VoiceSearchSession | null = null;

/** Abort any in-flight voice search session (e.g. before sending chat message). */
export function cancelActiveVoiceSearch(): void {
  activeVoiceSession?.cancel();
  activeVoiceSession = null;
}

/**
 * Flush WebKit SpeechRecognition state after a chat turn — prevents hang on 3rd+ utterance.
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
      rec.lang = "lt-LT";
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
 * Single SpeechRecognition session — delivers ONE final string on stop/end.
 * On Android APK, getUserMedia first triggers the system mic permission dialog.
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
      let silenceTimer: ReturnType<typeof setTimeout> | null = null;
      let maxTimer: ReturnType<typeof setTimeout> | null = null;
      let started = false;
      let stopping = false;

      const clearTimers = () => {
        if (silenceTimer) clearTimeout(silenceTimer);
        if (maxTimer) clearTimeout(maxTimer);
        silenceTimer = null;
        maxTimer = null;
      };

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
          deliverOnce(committedFinal.trim() || null);
        }
      };

      const scheduleSilenceStop = () => {
        if (!committedFinal.trim()) return;
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(requestStop, silenceMs);
      };

      stopFn = requestStop;
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
      rec.lang = "lt-LT";
      /** false — avoids infinite no-speech restart loops in Android WebView. */
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        committedFinal = "";
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
          },
          setInterimCaption: (value) => {
            onInterim?.(value);
          },
          onFinalTranscript: (value) => {
            committedFinal = value;
            onInterim?.("");
            requestStop();
          },
        });
        if (!isFinal && text.trim()) scheduleSilenceStop();
      };

      rec.onerror = (ev) => {
        if (ev.error === "aborted") return;
        if (ev.error === "no-speech") {
          requestStop();
          return;
        }
        if (ev.error === "not-allowed") {
          deliverOnce(null);
          return;
        }
        deliverOnce(committedFinal.trim() || null);
      };

      rec.onend = () => {
        if (resolved) return;
        deliverOnce(committedFinal.trim() || null);
      };

      maxTimer = setTimeout(requestStop, maxMs);

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
