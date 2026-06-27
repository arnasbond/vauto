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

/**
 * Web Speech API onresult — TIK paskutinis rezultatas, jokio lipdymo ar ciklų.
 * setInputValue gauna tik isFinal; interim eina į setInterimCaption.
 */
export function handleSpeechRecognitionResult(
  event: SpeechRecognitionResultEvent,
  handlers: SpeechRecognitionHandlers
): { isFinal: boolean; text: string } {
  if (!event.results.length) {
    return { isFinal: false, text: "" };
  }

  const lastResultIndex = event.results.length - 1;
  const currentTranscript = (event.results[lastResultIndex][0]?.transcript ?? "").trim();
  const isFinal = Boolean(event.results[lastResultIndex]?.isFinal);
  const text = sanitizeSpeechTranscript(currentTranscript);

  if (isFinal) {
    handlers.setInputValue?.(text);
  } else {
    handlers.setInterimCaption?.(text);
  }

  return { isFinal, text };
}

/** @deprecated Use handleSpeechRecognitionResult — kept for wake-word interim reads. */
export function readLastSpeechHypothesis(
  event: SpeechRecognitionResultEvent
): { text: string; isFinal: boolean } {
  if (!event.results.length) return { text: "", isFinal: false };
  const lastResultIndex = event.results.length - 1;
  const raw = (event.results[lastResultIndex][0]?.transcript ?? "").trim();
  return {
    text: sanitizeSpeechTranscript(raw),
    isFinal: Boolean(event.results[lastResultIndex]?.isFinal),
  };
}

/** Clean garbled STT output before AI analysis. */
export function sanitizeSpeechTranscript(text: string): string {
  let t = text.replace(/\s+/g, " ").trim();
  if (!t) return t;

  t = t.replace(/\b(\p{L}+)(?:\s+\1\b)+/giu, "$1");
  t = t.replace(/\b(\d{4})(?:\s+\1\b)+/g, "$1");
  t = t.replace(/(\p{L}{3,}?)\1{2,}/giu, "$1");
  t = t.replace(/\b(\p{L}{3,})(\1)+\b/giu, "$1");

  return t.replace(/\s+/g, " ").trim();
}
