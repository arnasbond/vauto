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
}

/** Mazgas 1: tik paskutinis STT slot — be lipdymo, be regex filtrų. */
export function handleSpeechRecognitionResult(
  event: SpeechRecognitionResultEvent,
  handlers: SpeechRecognitionHandlers
): { isFinal: boolean; text: string } {
  if (!event.results.length) {
    return { isFinal: false, text: "" };
  }

  const lastResultIndex = event.results.length - 1;
  const text = (event.results[lastResultIndex][0]?.transcript ?? "").trim();
  const isFinal = Boolean(event.results[lastResultIndex]?.isFinal);

  if (isFinal) {
    handlers.setInputValue?.(text);
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
  return {
    text: (event.results[lastResultIndex][0]?.transcript ?? "").trim(),
    isFinal: Boolean(event.results[lastResultIndex]?.isFinal),
  };
}

/** @deprecated Use raw trim from STT — kept for legacy imports. */
export function sanitizeSpeechTranscript(text: string): string {
  return text.trim();
}
