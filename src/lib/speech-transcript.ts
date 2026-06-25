/** Web Speech API result — incremental final + interim text without duplication. */
export function rebuildSpeechTranscript(event: {
  resultIndex: number;
  results: {
    length: number;
    [i: number]: { [j: number]: { transcript: string }; isFinal: boolean };
  };
}): { finalDelta: string; interim: string; hadFinal: boolean } {
  let finalDelta = "";
  let interim = "";
  let hadFinal = false;

  for (let i = event.resultIndex; i < event.results.length; i++) {
    const part = event.results[i]?.[0]?.transcript ?? "";
    if (event.results[i]?.isFinal) {
      finalDelta += part;
      hadFinal = true;
    } else {
      interim += part;
    }
  }

  return {
    finalDelta: finalDelta.trim(),
    interim: interim.trim(),
    hadFinal,
  };
}

/** Clean garbled STT output before AI analysis. */
export function sanitizeSpeechTranscript(text: string): string {
  let t = text.replace(/\s+/g, " ").trim();
  if (!t) return t;

  // "nori nori nori" → "nori"
  t = t.replace(/\b(\p{L}+)(?:\s+\1\b)+/giu, "$1");

  // "2006 2006 metų" → "2006 metų"
  t = t.replace(/\b(\d{4})(?:\s+\1\b)+/g, "$1");

  // Collapse glued duplicate syllables: "norinorinori" → "nori" (heuristic)
  t = t.replace(/(\p{L}{3,}?)\1{2,}/giu, "$1");

  // "Surask SuraskSurask" → "Surask"
  t = t.replace(/\b(\p{L}{3,})(\1)+\b/giu, "$1");

  return t.replace(/\s+/g, " ").trim();
}
