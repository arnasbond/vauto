/** Strategic v1.2 — voice STT disabled; text + Vision AI only. */
export const VAUTO_VOICE_INPUT_ENABLED = false;

/** No-op voice session when voice input is disabled. */
export function disabledVoiceSession(): {
  promise: Promise<string | null>;
  stop: () => void;
  cancel: () => void;
} {
  return {
    promise: Promise.resolve(null),
    stop: () => {},
    cancel: () => {},
  };
}
