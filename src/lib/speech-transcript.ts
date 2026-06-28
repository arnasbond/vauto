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
