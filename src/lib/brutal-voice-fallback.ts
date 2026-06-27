/** Direct HTML5 TTS — bypasses all agent/session layers when production agent fails. */

export const BRUTAL_VOICE_GREETING =
  "Labas! Aš esu gyvas AI asistentas. Pasakyk, ko ieškai — padėsiu surasti, parduoti ar derėtis.";

export function brutalHtml5Speak(text: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "lt-LT";
  utterance.rate = 0.92;
  window.speechSynthesis.speak(utterance);
}

/** Voice mic or short generic utterance → always kick live assistant, never dry catalog. */
export function shouldForceLiveVoiceAssistant(
  query: string,
  voice?: boolean
): boolean {
  if (voice) return true;
  const t = query.trim().toLowerCase();
  if (!t) return false;
  if (/^(labas|sveik|hey|hi|hello|automobilis|auto|drabuž|mada|pagalba|help)\b/i.test(t)) {
    return true;
  }
  return t.split(/\s+/).length <= 2;
}
