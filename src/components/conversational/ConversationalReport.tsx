"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { BuddyAvatar } from "@/components/conversational/BuddyAvatar";
import { BuddyQuickActions } from "@/components/conversational/BuddyQuickActions";
import type { BuddyQuickAction, BuddyActionId } from "@/lib/buddy-messages";
import {
  logBuddyState,
  speakBuddyMessage,
  stopBuddySpeech,
  type BuddyState,
} from "@/lib/buddy-voice";

interface ConversationalReportProps {
  userPrompt: string | null;
  buddyMessage: string;
  quickActions: BuddyQuickAction[];
  speakEnabled: boolean;
  canPublish: boolean;
  publishLabel: string;
  onQuickAction: (id: BuddyActionId) => void;
  onCancel: () => void;
  onPublish: () => void;
  children: ReactNode;
}

const TYPING_DELAY_MS = 1400;

export function ConversationalReport({
  userPrompt,
  buddyMessage,
  quickActions,
  speakEnabled,
  canPublish,
  publishLabel,
  onQuickAction,
  onCancel,
  onPublish,
  children,
}: ConversationalReportProps) {
  const [buddyState, setBuddyState] = useState<BuddyState>("typing");
  const [showMessage, setShowMessage] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const spokenRef = useRef(false);

  useEffect(() => {
    setBuddyState("typing");
    setShowMessage(false);
    spokenRef.current = false;
    logBuddyState("typing", { context: "seller_confirmation" });

    const typingTimer = setTimeout(() => {
      setShowMessage(true);
      setBuddyState("speaking");
      logBuddyState("speaking", {
        context: "seller_confirmation",
        preview: buddyMessage.slice(0, 60),
      });

      if (!spokenRef.current) {
        spokenRef.current = true;
        speakBuddyMessage(buddyMessage, {
          enabled: speakEnabled,
          onEnd: () => setBuddyState("idle"),
        });
        if (!speakEnabled) {
          setTimeout(() => setBuddyState("idle"), 400);
        }
      }
    }, TYPING_DELAY_MS);

    return () => {
      clearTimeout(typingTimer);
      stopBuddySpeech();
    };
  }, [buddyMessage, speakEnabled]);

  const handleAction = (id: BuddyQuickAction["id"]) => {
    if (id === "photo" || id === "change_price" || id === "edit_details") {
      setDetailsOpen(true);
    }
    onQuickAction(id);
  };

  const statusLabel =
    buddyState === "typing"
      ? "rašo…"
      : buddyState === "speaking"
        ? "kalba…"
        : "VAUTO draugas";

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[var(--flux-bg)]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--vauto-teal)]">
            VAUTO draugas
          </p>
          <p className="text-sm text-slate-400">Padedu paruošti skelbimą</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white"
          aria-label="Uždaryti"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto max-w-md space-y-4">
          {userPrompt && (
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-[var(--flux-indigo)]/40 px-4 py-3 text-base leading-relaxed text-white">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-200/70">
                  Jūs
                </p>
                {userPrompt}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <BuddyAvatar state={buddyState} />
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--vauto-teal)]">
                {statusLabel}
              </p>
              <div className="rounded-2xl rounded-tl-md bg-[var(--vauto-teal)]/12 px-4 py-3 ring-1 ring-[var(--vauto-teal)]/20">
                {!showMessage ? (
                  <div className="flex gap-1 py-2">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--vauto-teal)] [animation-delay:0ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--vauto-teal)] [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--vauto-teal)] [animation-delay:300ms]" />
                  </div>
                ) : (
                  <p className="text-base leading-relaxed text-teal-50">{buddyMessage}</p>
                )}
              </div>

              {showMessage && (
                <BuddyQuickActions actions={quickActions} onAction={handleAction} />
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-300"
          >
            {detailsOpen ? "Slėpti skelbimo detales" : "Rodyti skelbimo detales"}
            {detailsOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {detailsOpen && (
            <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              {children}
            </div>
          )}
        </div>
      </div>

      <div className="safe-bottom border-t border-white/10 bg-[var(--flux-bg)]/95 px-4 py-4 backdrop-blur-lg">
        <button
          type="button"
          onClick={onPublish}
          disabled={!canPublish}
          className="w-full min-h-[56px] rounded-2xl bg-[var(--flux-teal)] text-lg font-bold text-[var(--flux-bg)] shadow-lg shadow-[var(--flux-teal)]/25 transition hover:opacity-90 disabled:opacity-40"
        >
          {canPublish ? "Viskas gerai, publikuoti skelbimą" : publishLabel}
        </button>
      </div>
    </div>
  );
}
