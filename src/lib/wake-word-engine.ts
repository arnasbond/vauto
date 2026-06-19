import { logBuddyState } from "@/lib/buddy-voice";
import type {
  BrowserSpeechRecognition,
  SpeechRecognitionErrorEvent,
  SpeechRecognitionEvent,
  WakeWordPhase,
} from "@/lib/wake-word-types";

const WAKE_RE = /\b(v\s*auto|vauto|wauto)\b/i;
const ACTIVE_COMMAND_MS = 10_000;

export function logWakeEvent(
  event: string,
  detail: Record<string, string | number | boolean | undefined> = {}
) {
  const entry = { engine: "wake-word", event, ts: new Date().toISOString(), ...detail };
  if (typeof window !== "undefined") {
    console.info("[VAUTO Wake]", entry);
  }
  return entry;
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
}

/** Neon-pulsing wake ping via Web Audio API */
export function playWakePing(): void {
  if (typeof window === "undefined") return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    logWakeEvent("wake_ping_played", { frequency: 880 });
    osc.onended = () => void ctx.close();
  } catch (e) {
    logWakeEvent("wake_ping_error", { error: String(e) });
  }
}

function getRecognitionCtor():
  | (new () => BrowserSpeechRecognition)
  | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

function extractTranscript(ev: SpeechRecognitionEvent): string {
  let text = "";
  for (let i = ev.resultIndex; i < ev.results.length; i++) {
    text += ev.results[i]?.[0]?.transcript ?? "";
  }
  return text.trim();
}

function stripWakeWord(text: string): string {
  return text.replace(WAKE_RE, "").trim();
}

export interface WakeWordSessionCallbacks {
  onPhaseChange: (phase: WakeWordPhase) => void;
  onWake: (commandTail: string) => void;
  onCommand: (transcript: string) => void;
  onError: (message: string) => void;
}

export interface WakeWordSession {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
}

export function createWakeWordSession(
  callbacks: WakeWordSessionCallbacks
): WakeWordSession {
  const Ctor = getRecognitionCtor();
  let recognition: BrowserSpeechRecognition | null = null;
  let running = false;
  let phase: WakeWordPhase = "off";
  let activeTimer: ReturnType<typeof setTimeout> | null = null;
  let shouldRestart = false;

  const setPhase = (next: WakeWordPhase) => {
    phase = next;
    callbacks.onPhaseChange(next);
    logWakeEvent("phase_change", { phase: next });
  };

  const clearActiveTimer = () => {
    if (activeTimer) clearTimeout(activeTimer);
    activeTimer = null;
  };

  const enterActiveListening = (initialTail: string) => {
    playWakePing();
    setPhase("active");
    logBuddyState("listening", { context: "wake_word_active" });
    logWakeEvent("wake_detected", { initialTail: initialTail.slice(0, 80) });

    if (initialTail.length >= 4) {
      callbacks.onCommand(initialTail);
      return;
    }

    callbacks.onWake(initialTail);
    clearActiveTimer();
    activeTimer = setTimeout(() => {
      logWakeEvent("active_timeout");
      setPhase("passive");
    }, ACTIVE_COMMAND_MS);
  };

  const handleResult = (ev: SpeechRecognitionEvent) => {
    const transcript = extractTranscript(ev);
    if (!transcript) return;

    logWakeEvent("transcript", {
      phase,
      interim: !ev.results[ev.results.length - 1]?.isFinal,
      text: transcript.slice(0, 120),
    });

    if (phase === "processing") return;

    if (phase === "active") {
      if (transcript.length >= 3) {
        clearActiveTimer();
        callbacks.onCommand(transcript);
      }
      return;
    }

    if (WAKE_RE.test(transcript)) {
      const tail = stripWakeWord(transcript);
      enterActiveListening(tail);
    }
  };

  const bindRecognition = () => {
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "lt-LT";
    rec.maxAlternatives = 1;

    rec.onresult = handleResult;
    rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      logWakeEvent("recognition_error", { error: ev.error });
      callbacks.onError(ev.error);
    };
    rec.onend = () => {
      if (shouldRestart && running && phase !== "off") {
        try {
          rec.start();
          logWakeEvent("recognition_restarted");
        } catch {
          /* already started */
        }
      }
    };
    rec.onstart = () => logWakeEvent("recognition_started", { phase });

    return rec;
  };

  return {
    start() {
      if (!Ctor || running) return;
      recognition = bindRecognition();
      if (!recognition) {
        callbacks.onError("SpeechRecognition unsupported");
        return;
      }
      shouldRestart = true;
      running = true;
      setPhase("passive");
      logBuddyState("listening", { context: "wake_word_passive" });
      try {
        recognition.start();
      } catch (e) {
        logWakeEvent("start_error", { error: String(e) });
      }
    },
    stop() {
      shouldRestart = false;
      running = false;
      clearActiveTimer();
      setPhase("off");
      logBuddyState("idle", { context: "wake_word_stopped" });
      try {
        recognition?.abort();
      } catch {
        /* ignore */
      }
      recognition = null;
    },
    isRunning: () => running,
  };
}

/** Resume passive listening after command completes */
export function resumePassivePhase(
  session: WakeWordSession,
  onPhase: (p: WakeWordPhase) => void
) {
  onPhase("passive");
  if (!session.isRunning()) session.start();
}
