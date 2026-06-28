/** Legacy export — silence debounce removed; mic ends on isFinal or manual stop. */
export const VOICE_SILENCE_DEBOUNCE_MS = 0;

type SpeechResultsLike = {
  length: number;
  [i: number]: { [j: number]: { transcript: string }; isFinal: boolean };
};

export type SpeechRecognitionResultEvent = {
  results: SpeechResultsLike;
};

export interface SpeechRecognitionHandlers {
  /** Called only when the last result slot is final. */
  setInputValue?: (text: string) => void;
  /** Live caption while user is still speaking (interim hypothesis). */
  setInterimCaption?: (text: string) => void;
  /** Fired once per final slot — consumer should stop/abort recognition immediately. */
  onFinalTranscript?: (text: string) => void;
}

export interface SpeechRecognitionHandle {
  abort?: () => void;
  stop?: () => void;
}

/** Internal listing category IDs — must never appear as STT suffixes in the search bar. */
const LEGACY_APPENDED_CATEGORY_TOKENS = new Set([
  "other",
  "clothing",
  "vehicles",
  "electronics",
  "home",
  "services",
  "real_estate",
  "jobs",
]);

/** Hard-stop Web Speech session — prevents duplicate finals on mobile WebView/APK. */
export function teardownSpeechRecognition(rec: SpeechRecognitionHandle | null): void {
  if (!rec) return;
  try {
    rec.abort?.();
  } catch {
    try {
      rec.stop?.();
    } catch {
      /* ignore */
    }
  }
}

type SpeechRecognitionCtor = new () => {
  continuous: boolean;
  interimResults: boolean;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  abort: () => void;
  stop: () => void;
};

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

let silentResetInFlight: Promise<void> | null = null;

/**
 * Silent STT engine reset after WebView audio errors — recycles WebKit recognizer
 * without UI feedback so the next mic tap starts clean (no frozen UI / bad cuts).
 */
export function silentResetSpeechEngine(): Promise<void> {
  if (silentResetInFlight) return silentResetInFlight;

  silentResetInFlight = new Promise<void>((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }

    const SpeechRecognition = getSpeechRecognitionCtor();
    if (!SpeechRecognition) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    try {
      const rec = new SpeechRecognition();
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
        teardownSpeechRecognition(rec);
        finish();
      }, 80);
      window.setTimeout(finish, 450);
    } catch {
      finish();
    }
  }).finally(() => {
    silentResetInFlight = null;
  });

  return silentResetInFlight;
}

/** Recover from WebView STT errors — never deliver partial hypotheses after a fault. */
export async function recoverFromSpeechRecognitionError(
  errorCode: string
): Promise<{ deliverPartial: boolean }> {
  if (errorCode === "aborted" || errorCode === "no-speech") {
    return { deliverPartial: false };
  }
  if (errorCode === "not-allowed") {
    return { deliverPartial: false };
  }
  await silentResetSpeechEngine();
  return { deliverPartial: false };
}

/** Remove legacy agent bug suffixes (e.g. "batai clothing") without altering user words. */
export function stripLegacyCategorySuffixes(text: string): string {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1]!.toLowerCase();
    if (LEGACY_APPENDED_CATEGORY_TOKENS.has(last)) {
      tokens.pop();
    } else {
      break;
    }
  }
  return tokens.join(" ");
}

/** Mazgas 1: tik paskutinis STT slot — grynas vartotojo tekstas, be kategorijų priedėlių. */
export function handleSpeechRecognitionResult(
  event: SpeechRecognitionResultEvent,
  handlers: SpeechRecognitionHandlers
): { isFinal: boolean; text: string } {
  if (!event.results.length) {
    return { isFinal: false, text: "" };
  }

  const lastResultIndex = event.results.length - 1;
  const raw = (event.results[lastResultIndex][0]?.transcript ?? "").trim();
  const text = stripLegacyCategorySuffixes(raw);
  const isFinal = Boolean(event.results[lastResultIndex]?.isFinal);

  if (isFinal) {
    handlers.setInterimCaption?.("");
    handlers.setInputValue?.(text);
    handlers.onFinalTranscript?.(text);
  } else {
    handlers.setInterimCaption?.(text);
  }

  return { isFinal, text };
}

export function readLastSpeechHypothesis(
  event: SpeechRecognitionResultEvent
): { text: string; isFinal: boolean } {
  if (!event.results.length) return { text: "", isFinal: false };
  const lastResultIndex = event.results.length - 1;
  const raw = (event.results[lastResultIndex][0]?.transcript ?? "").trim();
  return {
    text: stripLegacyCategorySuffixes(raw),
    isFinal: Boolean(event.results[lastResultIndex]?.isFinal),
  };
}

/** Raw STT trim + strip legacy category suffixes accidentally shown in UI. */
export function sanitizeSpeechTranscript(text: string): string {
  return stripLegacyCategorySuffixes(text.trim());
}
