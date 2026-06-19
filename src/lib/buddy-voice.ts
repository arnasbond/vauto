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
  rate?: number;
  pitch?: number;
  onStart?: () => void;
  onEnd?: () => void;
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
  if (options.enabled === false) {
    logBuddyState("idle", { event: "speech_skipped", reason: "voice_mode_off" });
    return null;
  }

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

  utterance.onstart = () => {
    logBuddyState("speaking", { textPreview: text.slice(0, 80), voice: utterance.voice?.name });
    options.onStart?.();
  };
  utterance.onend = () => {
    logBuddyState("idle", { event: "speech_end" });
    options.onEnd?.();
  };
  utterance.onerror = (e) => {
    logBuddyState("idle", { event: "speech_error", error: e.error });
    options.onEnd?.();
  };

  logBuddyState("speaking", { event: "speech_enqueue", chars: text.length });
  window.speechSynthesis.speak(utterance);
  return utterance;
}

export function stopBuddySpeech() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
    logBuddyState("idle", { event: "speech_cancelled" });
  }
}
