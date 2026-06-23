"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from "react";
import {
  loadWakeWordEnabled,
  saveWakeWordEnabled,
} from "@/lib/storage";
import { logAnalytics } from "@/lib/analytics";
import { speakBuddyMessage, stopBuddySpeech } from "@/lib/buddy-voice";
import {
  createWakeWordSession,
  isWakeWordBackgroundSupported,
  logWakeEvent,
  resumePassivePhase,
  type WakeWordSession,
} from "@/lib/wake-word-engine";
import { subscribeAppVisibility, isAppForeground } from "@/lib/app-visibility";
import type { WakeWordPhase } from "@/lib/wake-word-types";
import {
  executeVoiceIntent,
  parseVoiceIntent,
} from "@/lib/voice-intent-engine";
import { requestNotificationPermission } from "@/lib/push-alerts";
import type { Listing } from "@/lib/types";

export interface WakeWordContextValue {
  wakeWordEnabled: boolean;
  wakeWordPhase: WakeWordPhase;
  wakeWordStatusText: string | undefined;
  wakeWordTranscript: string | undefined;
  setWakeWordEnabled: (enabled: boolean) => void;
  requestWakeWordConsent: () => void;
  disableWakeWordInstantly: () => void;
}

export interface WakeWordDeps {
  hydrated: boolean;
  gdprConsent: boolean;
  userCity: string;
  listingsRef: RefObject<Listing[]>;
  setSearchQuery: (q: string) => void;
  showToast: (
    message: string,
    type: "success" | "error" | "info" | "buddy"
  ) => void;
  requestGdprModalForWake: () => void;
}

export interface WakeWordActions {
  enableAfterGdprConsent: () => void;
  disableOnGdprRevoke: () => void;
}

const WakeWordContext = createContext<WakeWordContextValue | null>(null);

export function WakeWordProvider({
  deps,
  actionsRef,
  children,
}: {
  deps: WakeWordDeps;
  actionsRef: MutableRefObject<WakeWordActions | null>;
  children: ReactNode;
}) {
  const [wakeWordEnabled, setWakeWordEnabledState] = useState(false);
  const [wakeWordPhase, setWakeWordPhase] = useState<WakeWordPhase>("off");
  const [wakeWordStatusText, setWakeWordStatusText] = useState<string>();
  const [wakeWordTranscript, setWakeWordTranscript] = useState<string>();
  const wakeWordSessionRef = useRef<WakeWordSession | null>(null);

  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    if (!deps.hydrated) return;
    if (!isWakeWordBackgroundSupported()) {
      if (loadWakeWordEnabled()) {
        saveWakeWordEnabled(false);
        logWakeEvent("disabled_unsupported_device");
      }
      return;
    }
    if (deps.gdprConsent && loadWakeWordEnabled()) {
      setWakeWordEnabledState(true);
    }
  }, [deps.hydrated, deps.gdprConsent]);

  const disableWakeWordInstantly = useCallback(() => {
    wakeWordSessionRef.current?.stop();
    wakeWordSessionRef.current = null;
    setWakeWordEnabledState(false);
    saveWakeWordEnabled(false);
    setWakeWordPhase("off");
    setWakeWordTranscript(undefined);
    setWakeWordStatusText(undefined);
    stopBuddySpeech();
    logWakeEvent("disabled_instant");
    depsRef.current.showToast(
      "Budintis režimas išjungtas — mikrofonas neaktyvus",
      "info"
    );
  }, []);

  const setWakeWordEnabled = useCallback(
    (enabled: boolean) => {
      if (!enabled) {
        disableWakeWordInstantly();
        return;
      }
      if (!isWakeWordBackgroundSupported()) {
        depsRef.current.showToast(
          "Budintis režimas fone telefone nepalaikomas — naudokite balso mygtuką paieškoje arba pranešimus",
          "info"
        );
        return;
      }
      setWakeWordEnabledState(true);
      saveWakeWordEnabled(true);
      void requestNotificationPermission();
      logWakeEvent("enabled");
    },
    [disableWakeWordInstantly]
  );

  const requestWakeWordConsent = useCallback(() => {
    if (depsRef.current.gdprConsent) {
      setWakeWordEnabled(true);
      return;
    }
    depsRef.current.requestGdprModalForWake();
  }, [setWakeWordEnabled]);

  const processWakeCommand = useCallback((transcript: string) => {
    const { userCity, listingsRef, setSearchQuery, showToast } = depsRef.current;
    setWakeWordPhase("processing");
    setWakeWordTranscript(transcript);
    setWakeWordStatusText("Suprantu…");
    logWakeEvent("command_received", { transcript: transcript.slice(0, 120) });

    const intent = parseVoiceIntent(transcript, userCity || "Lietuva");
    const result = executeVoiceIntent(intent, listingsRef.current ?? []);

    setWakeWordStatusText(result.response);
    logAnalytics("wake_word_detected", {
      intent: intent.type,
      matches: result.matchCount,
    });

    if (result.topListing && intent.type === "check_new_ads") {
      setSearchQuery(intent.topic);
    }

    speakBuddyMessage(result.response, {
      enabled: true,
      onEnd: () => {
        setWakeWordTranscript(undefined);
        setWakeWordStatusText(undefined);
        const session = wakeWordSessionRef.current;
        if (session?.isRunning() && isAppForeground()) {
          resumePassivePhase(session, setWakeWordPhase);
        } else if (session?.isRunning()) {
          setWakeWordPhase("suspended");
        } else {
          setWakeWordPhase("passive");
        }
      },
    });

    if (result.topListing) {
      showToast(result.response, "buddy");
    }
  }, []);

  useEffect(() => {
    actionsRef.current = {
      enableAfterGdprConsent: () => {
        if (!isWakeWordBackgroundSupported()) return;
        setWakeWordEnabledState(true);
        saveWakeWordEnabled(true);
        void requestNotificationPermission();
        logWakeEvent("enabled_after_consent");
      },
      disableOnGdprRevoke: () => {
        wakeWordSessionRef.current?.stop();
        wakeWordSessionRef.current = null;
        setWakeWordEnabledState(false);
        saveWakeWordEnabled(false);
        setWakeWordPhase("off");
        stopBuddySpeech();
        logWakeEvent("disabled_via_gdpr_revoke");
      },
    };
    return () => {
      actionsRef.current = null;
    };
  }, [actionsRef]);

  useEffect(() => {
    if (
      !deps.hydrated ||
      !wakeWordEnabled ||
      !deps.gdprConsent ||
      !isWakeWordBackgroundSupported()
    ) {
      wakeWordSessionRef.current?.stop();
      wakeWordSessionRef.current = null;
      if (!wakeWordEnabled) setWakeWordPhase("off");
      return;
    }

    const session = createWakeWordSession({
      onPhaseChange: setWakeWordPhase,
      onWake: () => {
        setWakeWordTranscript(undefined);
        setWakeWordStatusText(undefined);
      },
      onCommand: (transcript) => processWakeCommand(transcript),
      onError: (message) => {
        logWakeEvent("session_error", { message });
        if (message === "not-allowed") {
          disableWakeWordInstantly();
          depsRef.current.showToast("Mikrofono prieiga atmesta", "error");
        }
      },
    });

    wakeWordSessionRef.current = session;
    session.start();
    if (!isAppForeground()) {
      session.pause();
      logWakeEvent("session_started_suspended");
    } else {
      logWakeEvent("session_started");
    }

    const unsubVisibility = subscribeAppVisibility((foreground) => {
      const s = wakeWordSessionRef.current;
      if (!s?.isRunning()) return;
      if (foreground) {
        s.resume();
        logWakeEvent("session_resumed_foreground");
      } else {
        s.pause();
        logWakeEvent("session_paused_background");
      }
    });

    return () => {
      unsubVisibility();
      session.stop();
      wakeWordSessionRef.current = null;
    };
  }, [
    deps.hydrated,
    deps.gdprConsent,
    wakeWordEnabled,
    processWakeCommand,
    disableWakeWordInstantly,
  ]);

  const value = useMemo(
    (): WakeWordContextValue => ({
      wakeWordEnabled,
      wakeWordPhase,
      wakeWordStatusText,
      wakeWordTranscript,
      setWakeWordEnabled,
      requestWakeWordConsent,
      disableWakeWordInstantly,
    }),
    [
      wakeWordEnabled,
      wakeWordPhase,
      wakeWordStatusText,
      wakeWordTranscript,
      setWakeWordEnabled,
      requestWakeWordConsent,
      disableWakeWordInstantly,
    ]
  );

  return (
    <WakeWordContext.Provider value={value}>{children}</WakeWordContext.Provider>
  );
}

export function useWakeWord(): WakeWordContextValue {
  const ctx = useContext(WakeWordContext);
  if (!ctx) {
    throw new Error("useWakeWord must be used within WakeWordProvider");
  }
  return ctx;
}
