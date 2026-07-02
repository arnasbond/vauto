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

export interface SpeakBuddyOptions {
  enabled?: boolean;
  /** Always speak — ignores voice_mode_off (used after voice agent replies) */
  force?: boolean;
  rate?: number;
  pitch?: number;
  onStart?: () => void;
  onEnd?: () => void;
}

/**
 * Voice output is intentionally disabled across VAUTO.
 * Keep the public function as an inert compatibility shim so older flows can
 * finish callbacks without triggering SpeechSynthesis.
 */
export function speakBuddyMessage(
  _text: string,
  options: SpeakBuddyOptions = {}
): SpeechSynthesisUtterance | null {
  logBuddyState("idle", { event: "speech_disabled" });
  options.onEnd?.();
  return null;
}

export function stopBuddySpeech() {
  logBuddyState("idle", { event: "speech_disabled_cancel" });
}
