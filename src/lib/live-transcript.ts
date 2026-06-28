import {
  handleSpeechRecognitionResult,
  teardownSpeechRecognition,
} from "@/lib/speech-transcript";

type SpeechRecognitionCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult:
    | ((e: {
        resultIndex: number;
        results: {
          length: number;
          [i: number]: { [j: number]: { transcript: string }; isFinal: boolean };
        };
      }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Streams interim speech-to-text for zero-latency subtitle feedback while recording.
 * Runs in parallel with Whisper / MediaRecorder — visual only.
 */
export function startLiveTranscript(
  onUpdate: (text: string) => void
): () => void {
  const SpeechRecognition = getSpeechRecognition();
  if (!SpeechRecognition) return () => {};

  const rec = new SpeechRecognition();
  rec.lang = "lt-LT";
  rec.continuous = true;
  rec.interimResults = true;

  rec.onstart = () => {
    onUpdate("");
  };

  rec.onresult = (event) => {
    handleSpeechRecognitionResult(event, {
      setInputValue: onUpdate,
      setInterimCaption: onUpdate,
      onFinalTranscript: () => {
        onUpdate("");
        teardownSpeechRecognition(rec);
      },
    });
  };

  rec.onerror = () => {
    teardownSpeechRecognition(rec);
  };
  rec.onend = () => {
    teardownSpeechRecognition(rec);
  };

  try {
    rec.start();
  } catch {
    return () => {};
  }

  return () => {
    teardownSpeechRecognition(rec);
  };
}
