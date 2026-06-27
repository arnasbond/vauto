import { sanitizeSpeechTranscript } from "@/lib/speech-transcript";

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
  /** Live caption — latest hypothesis only, never duplicated finals */
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

/**
 * Rebuild transcript from the FULL results array each event.
 * Finals: one segment per result index. Interim: replace trailing hypothesis only.
 * Prevents "ieškau Volvo ieškau Volvo" echo from append + interim overlap.
 */
function snapshotTranscript(results: SpeechResults): {
  committed: string;
  preview: string;
} {
  const finals: string[] = [];
  let trailingInterim = "";

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const part = (result?.[0]?.transcript ?? "").trim();
    if (!part) continue;

    if (result.isFinal) {
      finals.push(part);
    } else {
      trailingInterim = part;
    }
  }

  const committed = sanitizeSpeechTranscript(finals.join(" "));
  let preview = committed;

  if (trailingInterim) {
    const interim = sanitizeSpeechTranscript(trailingInterim);
    if (!committed) {
      preview = interim;
    } else {
      const lcCommitted = committed.toLowerCase();
      const lcInterim = interim.toLowerCase();
      if (
        lcInterim.startsWith(lcCommitted) ||
        lcInterim.includes(lcCommitted)
      ) {
        preview = interim;
      } else {
        preview = sanitizeSpeechTranscript(`${committed} ${interim}`);
      }
    }
  }

  return { committed, preview };
}

/**
 * Single SpeechRecognition session — delivers ONE final string on onend/stop only.
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

  let resolved = false;
  let rec: InstanceType<SpeechRecognitionCtor> | null = null;
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

  let resolvePromise: (value: string | null) => void = () => {};
  const promise = new Promise<string | null>((resolve) => {
    resolvePromise = resolve;
  });

  const deliverOnce = (text: string | null) => {
    if (resolved) return;
    resolved = true;
    clearTimers();
    try {
      rec?.abort();
    } catch {
      /* ignore */
    }
    rec = null;
    resolvePromise(text?.trim() ? sanitizeSpeechTranscript(text.trim()) : null);
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

  rec = new SpeechRecognition();
  rec.lang = "lt-LT";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onstart = () => {
    if (!started) {
      started = true;
      onStart?.();
    }
  };

  rec.onresult = (event) => {
    const { committed, preview } = snapshotTranscript(event.results);
    committedFinal = committed;
    onInterim?.(preview);
    if (committed) scheduleSilenceStop();
  };

  rec.onerror = (ev) => {
    if (ev.error === "no-speech" || ev.error === "aborted") return;
    if (ev.error === "not-allowed") deliverOnce(null);
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

  return {
    promise,
    stop: requestStop,
    cancel: () => {
      if (resolved) return;
      stopping = true;
      clearTimers();
      try {
        rec?.abort();
      } catch {
        /* ignore */
      }
      rec = null;
      resolved = true;
      resolvePromise(null);
    },
  };
}

export function isVoiceSearchSupported(): boolean {
  if (getSpeechRecognition()) return true;
  if (typeof navigator === "undefined") return false;
  return Boolean(navigator.mediaDevices?.getUserMedia);
}
