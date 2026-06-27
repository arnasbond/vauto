type SpeechResultsLike = {
  length: number;
  [i: number]: { [j: number]: { transcript: string }; isFinal: boolean };
};

export type SpeechRecognitionResultEvent = {
  results: SpeechResultsLike;
};

/**
 * Web Speech API onresult — TIK paskutinis rezultatas, jokio lipdymo ar ciklų.
 * setInputValue atnaujina ir final, ir interim hipotezę.
 */
export function handleSpeechRecognitionResult(
  event: SpeechRecognitionResultEvent,
  setInputValue: (text: string) => void
): { isFinal: boolean; text: string } {
  if (!event.results.length) {
    return { isFinal: false, text: "" };
  }

  const lastResultIndex = event.results.length - 1;
  const currentTranscript = (event.results[lastResultIndex][0]?.transcript ?? "").trim();
  const isFinal = Boolean(event.results[lastResultIndex]?.isFinal);
  const text = sanitizeSpeechTranscript(currentTranscript);

  setInputValue(text);

  return { isFinal, text };
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
