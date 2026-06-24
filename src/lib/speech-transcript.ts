/** Web Speech API result — rebuild final + interim text without duplication. */
export function rebuildSpeechTranscript(event: {
  results: {
    length: number;
    [i: number]: { [j: number]: { transcript: string }; isFinal: boolean };
  };
}): { final: string; interim: string; combined: string } {
  let final = "";
  let interim = "";
  for (let i = 0; i < event.results.length; i++) {
    const part = event.results[i]?.[0]?.transcript ?? "";
    if (event.results[i]?.isFinal) final += part;
    else interim += part;
  }
  const combined = `${final}${interim}`.replace(/\s+/g, " ").trim();
  return { final: final.trim(), interim: interim.trim(), combined };
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

  return t.replace(/\s+/g, " ").trim();
}
