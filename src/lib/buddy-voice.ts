import { truncateVoiceReply } from "@/lib/agent-reply-display";
import {
  DEFAULT_LOCALE,
  ensureSpeechVoicesReady,
  getLockedLocale,
  hasLocaleVoice,
  speakWithLocale,
  stopLocaleSpeech,
} from "@/lib/SpeechEngine";

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

export { hasLocaleVoice as hasLithuanianVoice } from "@/lib/SpeechEngine";
export { selectBestVoice as pickLithuanianVoice } from "@/lib/SpeechEngine";

export interface SpeakBuddyOptions {
  enabled?: boolean;
  /** Always speak — ignores voice_mode_off (used after voice agent replies) */
  force?: boolean;
  rate?: number;
  pitch?: number;
  onStart?: () => void;
  onEnd?: () => void;
}

/** Read buddy message aloud — native Lithuanian TTS voice only. */
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

  const clean = truncateVoiceReply(text.trim());
  if (!clean) return null;

  if (!hasLocaleVoice(getLockedLocale())) {
    logBuddyState("idle", { event: "speech_skipped", reason: "no_lt_voice" });
    return null;
  }

  void ensureSpeechVoicesReady();

  return speakWithLocale(clean, {
    lang: getLockedLocale(),
    rate: options.rate ?? 0.9,
    pitch: options.pitch ?? 1,
    onStart: () => {
      logBuddyState("speaking", {
        textPreview: clean.slice(0, 80),
        locale: getLockedLocale(),
      });
      options.onStart?.();
    },
    onEnd: () => {
      logBuddyState("idle", { event: "speech_end" });
      options.onEnd?.();
    },
    onError: (error) => {
      logBuddyState("idle", { event: "speech_error", error, locale: DEFAULT_LOCALE });
      options.onEnd?.();
    },
  });
}

export function stopBuddySpeech() {
  stopLocaleSpeech();
  logBuddyState("idle", { event: "speech_cancelled" });
}
