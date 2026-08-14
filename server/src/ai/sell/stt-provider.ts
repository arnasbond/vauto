/**
 * Speech-to-text provider abstraction (10C).
 * Production adapter can wrap a real STT vendor; tests use MockSpeechToTextProvider.
 */

export type SttTranscribeInput = {
  /** Audio bytes or remote URL — production only. */
  audioUrl?: string;
  audioBase64?: string;
  mimeType?: string;
  language?: string;
};

export type SttTranscribeResult = {
  /** Raw STT output — never mutate this string in place. */
  originalTranscript: string;
  /** Optional provider confidence 0..1 */
  confidence?: number;
  provider: string;
};

export interface SpeechToTextProvider {
  readonly name: string;
  transcribe(input: SttTranscribeInput): Promise<SttTranscribeResult>;
}

/** Deterministic mock for unit tests / offline corpus. */
export class MockSpeechToTextProvider implements SpeechToTextProvider {
  readonly name = "mock-stt";
  constructor(private readonly canned: string = "") {}

  async transcribe(input: SttTranscribeInput): Promise<SttTranscribeResult> {
    const originalTranscript =
      this.canned ||
      String(input.audioUrl ?? input.audioBase64 ?? "").slice(0, 0) ||
      "";
    return {
      originalTranscript,
      confidence: 0.99,
      provider: this.name,
    };
  }
}

/**
 * Production stub — wires via env STT_PROVIDER when a real vendor is configured.
 * Without credentials it throws (callers should catch and continue with provided transcript).
 */
export class EnvSpeechToTextProvider implements SpeechToTextProvider {
  readonly name = process.env.STT_PROVIDER?.trim() || "env-stt";

  async transcribe(_input: SttTranscribeInput): Promise<SttTranscribeResult> {
    const key = process.env.STT_API_KEY?.trim();
    if (!key) {
      throw new Error("STT_API_KEY not configured");
    }
    // Real vendor HTTP call is intentionally not inlined here (10C foundation).
    // Use injected transcript on SellInput for voice-to-draft until vendor adapter lands.
    throw new Error("STT production adapter not wired — pass SellInput.transcript");
  }
}

export function createDefaultSttProvider(): SpeechToTextProvider {
  if (process.env.STT_API_KEY?.trim()) {
    return new EnvSpeechToTextProvider();
  }
  return new MockSpeechToTextProvider();
}
