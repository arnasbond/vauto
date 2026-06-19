type SpeechRecognitionCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
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

  let committed = "";

  rec.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const part = event.results[i]?.[0]?.transcript ?? "";
      if (event.results[i]?.isFinal) committed += part;
      else interim += part;
    }
    const combined = `${committed}${interim}`.trim();
    if (combined) onUpdate(combined);
  };

  rec.onerror = () => {};
  rec.onend = () => {};

  try {
    rec.start();
  } catch {
    return () => {};
  }

  return () => {
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
  };
}
