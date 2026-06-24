const BAR_COUNT = 9;

export interface VoiceSession {
  /** Normalized bar levels 0.18–1.0 for visualizer */
  getLevels: () => number[];
  /** Record from the same mic stream (no second permission prompt) */
  record: (maxMs?: number) => Promise<Blob | null>;
  release: () => void;
}

function sampleLevels(analyser: AnalyserNode): number[] {
  const buffer = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(buffer);
  const slice = Math.max(1, Math.floor(buffer.length / BAR_COUNT));
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const start = i * slice;
    let sum = 0;
    for (let j = start; j < start + slice; j++) sum += buffer[j] ?? 0;
    const avg = sum / slice / 255;
    return Math.max(0.18, Math.min(1, avg * 2.4));
  });
}

/** Single mic stream shared by visualizer + recorder */
export async function createVoiceSession(): Promise<VoiceSession | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return null;
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return null;
  }

  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;

  try {
    audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.72;
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
  } catch {
    /* recording still works without visualizer */
  }

  let released = false;

  const release = () => {
    if (released) return;
    released = true;
    stream.getTracks().forEach((t) => t.stop());
    void audioCtx?.close();
  };

  return {
    getLevels: () => (analyser ? sampleLevels(analyser) : Array(BAR_COUNT).fill(0.35)),
    record: (maxMs = 18_000) =>
      new Promise((resolve) => {
        const chunks: BlobPart[] = [];
        const recorder = new MediaRecorder(stream);
        let finished = false;

        const done = (blob: Blob | null) => {
          if (finished) return;
          finished = true;
          resolve(blob);
        };

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = () => {
          done(chunks.length ? new Blob(chunks, { type: "audio/webm" }) : null);
        };
        recorder.onerror = () => done(null);

        try {
          recorder.start();
          setTimeout(() => {
            if (recorder.state === "recording") recorder.stop();
          }, maxMs);
        } catch {
          done(null);
        }
      }),
    release,
  };
}

/** Transcribe using browser speech only (Whisper removed). */
export async function transcribeFromSession(
  _session: VoiceSession
): Promise<string | null> {
  return null;
}
