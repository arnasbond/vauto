/** Web Speech API + conversational state logging for VAUTO Digital Buddy */

export type BuddyState =
  | "idle"
  | "typing"
  | "speaking"
  | "listening"
  | "follow_up";

export function logBuddyState(
  state: BuddyState,
  detail: Record<string, string | number | boolean | undefined> = {}
) {
  const entry = { state, ts: new Date().toISOString(), ...detail };
  if (typeof window !== "undefined") {
    console.info("[VAUTO Buddy]", entry);
  }
  return entry;
}

export function getFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed || trimmed === "Svečias") return "drauge";
  return trimmed.split(/\s+/)[0]?.replace(/\.$/, "") ?? "drauge";
}

function pickLithuanianVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window === "undefined" || !window.speechSynthesis) return undefined;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang.startsWith("lt")) ??
    voices.find((v) => v.lang.startsWith("en") && v.name.toLowerCase().includes("female")) ??
    voices[0]
  );
}

let voicesReady = false;
if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    voicesReady = true;
    logBuddyState("idle", { event: "voices_loaded", count: window.speechSynthesis.getVoices().length });
  };
}

export interface SpeakBuddyOptions {
  enabled?: boolean;
  /** Always speak — ignores voice_mode_off (used after voice agent replies) */
  force?: boolean;
  rate?: number;
  pitch?: number;
  onStart?: () => void;
  onEnd?: () => void;
}

function speakWithSynthesis(
  text: string,
  options: SpeakBuddyOptions
): SpeechSynthesisUtterance | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "lt-LT";
  utterance.rate = options.rate ?? 0.92;
  utterance.pitch = options.pitch ?? 1.05;
  utterance.volume = 1;

  if (voicesReady || window.speechSynthesis.getVoices().length > 0) {
    const voice = pickLithuanianVoice();
    if (voice) utterance.voice = voice;
  }

  let started = false;
  utterance.onstart = () => {
    started = true;
    logBuddyState("speaking", { textPreview: text.slice(0, 80), voice: utterance.voice?.name });
    options.onStart?.();
  };
  utterance.onend = () => {
    logBuddyState("idle", { event: "speech_end" });
    options.onEnd?.();
  };
  utterance.onerror = (e) => {
    logBuddyState("idle", { event: "speech_error", error: e.error });
    if (!started) {
      const fallback = new SpeechSynthesisUtterance(text);
      fallback.lang = "lt-LT";
      fallback.rate = options.rate ?? 0.92;
      window.speechSynthesis.speak(fallback);
    }
    options.onEnd?.();
  };

  logBuddyState("speaking", { event: "speech_enqueue", chars: text.length });
  window.speechSynthesis.speak(utterance);

  window.setTimeout(() => {
    if (started || !window.speechSynthesis) return;
    logBuddyState("speaking", { event: "speech_synthesis_fallback_retry" });
    const retry = new SpeechSynthesisUtterance(text);
    retry.lang = "lt-LT";
    retry.rate = options.rate ?? 0.92;
    window.speechSynthesis.speak(retry);
  }, 400);

  return utterance;
}

/** Read buddy message aloud — warm, slightly slower pace for seniors */
export function speakBuddyMessage(
  text: string,
  options: SpeakBuddyOptions = {}
): SpeechSynthesisUtterance | null {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    logBuddyState("idle", { event: "speech_unavailable" });
    return null;
  }
  if (options.enabled === false && !options.force) {
    logBuddyState("idle", { event: "speech_skipped", reason: "voice_mode_off" });
    return null;
  }

  const clean = text.trim();
  if (!clean) return null;

  return speakWithSynthesis(clean, options);
}

export function stopBuddySpeech() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
    logBuddyState("idle", { event: "speech_cancelled" });
  }
}
