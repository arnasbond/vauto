"use client";

import { Mic, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { hasOpenAiKey } from "@/lib/openai-settings";
import { AudioWaveAnimation } from "@/components/AudioWaveAnimation";
import { createVoiceSession, recordWithSession } from "@/lib/native-media";
import type { VoiceSession } from "@/lib/audio-session";

interface VoiceRecorderOverlayProps {
  onComplete: (transcript: string | null) => void;
  onCancel: () => void;
}

export function VoiceRecorderOverlay({
  onComplete,
  onCancel,
}: VoiceRecorderOverlayProps) {
  const [seconds, setSeconds] = useState(0);
  const [session, setSession] = useState<VoiceSession | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const levelSource = useCallback(
    () => session?.getLevels() ?? Array(9).fill(0.35),
    [session]
  );

  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let activeSession: VoiceSession | null = null;

    async function run() {
      activeSession = await createVoiceSession();
      if (cancelled) {
        activeSession?.release();
        return;
      }
      setSession(activeSession);

      const transcript = activeSession
        ? await recordWithSession(activeSession)
        : null;

      if (!cancelled) onCompleteRef.current(transcript);
    }

    run();

    return () => {
      cancelled = true;
      activeSession?.release();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="mx-6 w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-2xl">
        <div className="relative mx-auto mb-6 flex h-28 w-full items-center justify-center">
          <span className="mic-ring-pulse absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--vauto-orange)]/20" />
          <span
            className="mic-ring-pulse absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--vauto-orange)]/10"
            style={{ animationDelay: "0.7s" }}
          />
          <div className="relative flex flex-col items-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[var(--vauto-orange)] to-[var(--vauto-red)] shadow-lg">
              <Mic className="h-8 w-8 text-white" fill="white" strokeWidth={0} />
            </span>
            <AudioWaveAnimation
              variant="large"
              levelSource={session ? levelSource : undefined}
            />
          </div>
        </div>
        <h2 className="text-lg font-semibold text-[var(--vauto-text)]">
          Klausomasi...
        </h2>
        <p className="mt-2 text-sm text-[var(--vauto-text-muted)]">
          {hasOpenAiKey()
            ? "Whisper klauso — papasakokite ką parduodate"
            : "Papasakokite ką parduodate — AI ištrauks duomenis"}
        </p>
        <p className="mt-4 text-xs text-[var(--vauto-text-muted)]">
          {seconds}s
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 py-3 text-sm font-medium text-[var(--vauto-text-muted)]"
        >
          <Square className="h-4 w-4" />
          Atšaukti
        </button>
      </div>
    </div>
  );
}
