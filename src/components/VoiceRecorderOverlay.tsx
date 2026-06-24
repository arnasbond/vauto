"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BuddyVoicePulse } from "@/components/buddy/BuddyVoicePulse";
import { createVoiceSession, recordWithSession } from "@/lib/native-media";
import { startLiveTranscript } from "@/lib/live-transcript";
import { isMobileDevice } from "@/lib/mobile-install";
import type { VoiceSession } from "@/lib/audio-session";

interface VoiceRecorderOverlayProps {
  onComplete: (transcript: string | null) => void;
  onCancel: () => void;
}

export function VoiceRecorderOverlay({
  onComplete,
  onCancel,
}: VoiceRecorderOverlayProps) {
  const [liveSubtitle, setLiveSubtitle] = useState("");
  const [session, setSession] = useState<VoiceSession | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const levelSource = useCallback(
    () => session?.getLevels() ?? Array(9).fill(0.35),
    [session]
  );

  useEffect(() => {
    let cancelled = false;
    let activeSession: VoiceSession | null = null;
    let stopTranscript = () => {};
    const useLiveSubtitle = !isMobileDevice();

    async function run() {
      activeSession = await createVoiceSession();
      if (cancelled) {
        activeSession?.release();
        return;
      }
      setSession(activeSession);

      if (useLiveSubtitle) {
        stopTranscript = startLiveTranscript((text) => {
          if (!cancelled) setLiveSubtitle(text);
        });
      }

      const transcript = activeSession
        ? await recordWithSession(activeSession)
        : null;

      if (!cancelled) onCompleteRef.current(transcript);
    }

    void run();

    return () => {
      cancelled = true;
      stopTranscript();
      activeSession?.release();
    };
  }, []);

  return (
    <BuddyVoicePulse
      mode="listening"
      variant="fullscreen"
      subtitle={liveSubtitle}
      statusText="Klausausi…"
      hint="Papasakokite ką norite — Gemini padės suprasti"
      levelSource={session ? levelSource : undefined}
      onCancel={onCancel}
    />
  );
}
