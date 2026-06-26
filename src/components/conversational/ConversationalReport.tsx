"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, MessageCircle, X } from "lucide-react";
import { BuddyAvatar } from "@/components/conversational/BuddyAvatar";
import { BuddyQuickActions } from "@/components/conversational/BuddyQuickActions";
import { BuddyFab } from "@/components/buddy/BuddyFab";
import type { BuddyQuickAction, BuddyActionId } from "@/lib/buddy-messages";
import type { WizardQuickReply } from "@/lib/listing-wizard";
import type { WizardThreadMessage } from "@/hooks/useListingWizard";
import {
  logBuddyState,
  speakBuddyMessage,
  stopBuddySpeech,
  type BuddyState,
} from "@/lib/buddy-voice";
import { useVauto } from "@/context/VautoContext";
import { getChameleonTheme } from "@/lib/chameleon-themes";
import { cn } from "@/lib/cn";

interface ConversationalReportProps {
  userPrompt: string | null;
  buddyMessage: string;
  quickActions: BuddyQuickAction[];
  speakEnabled: boolean;
  canPublish: boolean;
  publishLabel: string;
  portalStyleLabel?: string;
  manualFallback?: boolean;
  onQuickAction: (id: BuddyActionId) => void;
  onCancel: () => void;
  onPublish: () => void;
  wizardThread?: WizardThreadMessage[];
  wizardQuickReplies?: WizardQuickReply[];
  onWizardReply?: (reply: WizardQuickReply) => void;
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
  portalStyleLabel,
  manualFallback = false,
  onQuickAction,
  onCancel,
  onPublish,
  wizardThread = [],
  wizardQuickReplies = [],
  onWizardReply,
  children,
}: ConversationalReportProps) {
  const { chameleonTheme } = useVauto();
  const theme = getChameleonTheme(chameleonTheme);
  const t = theme.confirmation;
  const classic = theme.classicLayout;

  const [buddyState, setBuddyState] = useState<BuddyState>(manualFallback ? "idle" : "typing");
  const [showMessage, setShowMessage] = useState(manualFallback);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const spokenRef = useRef(false);

  useEffect(() => {
    if (manualFallback || !canPublish) {
      setDetailsOpen(true);
      return;
    }
    const t = window.setTimeout(() => setDetailsOpen(true), 550);
    return () => window.clearTimeout(t);
  }, [manualFallback, canPublish]);

  useEffect(() => {
    if (manualFallback) {
      setBuddyState("idle");
      setShowMessage(true);
      setDetailsOpen(true);
      spokenRef.current = true;
      logBuddyState("idle", { context: "seller_manual_fallback", theme: chameleonTheme });
      return;
    }

    setBuddyState("typing");
    setShowMessage(false);
    spokenRef.current = false;
    logBuddyState("typing", { context: "seller_confirmation", theme: chameleonTheme });

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const typingDelay =
      manualFallback || reducedMotion ? 0 : TYPING_DELAY_MS;

    const typingTimer = setTimeout(() => {
      setShowMessage(true);
      setBuddyState("speaking");
      logBuddyState("speaking", {
        context: "seller_confirmation",
        theme: chameleonTheme,
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
    }, typingDelay);

    return () => {
      clearTimeout(typingTimer);
      stopBuddySpeech();
    };
  }, [buddyMessage, speakEnabled, chameleonTheme, manualFallback]);

  const handleAction = (id: BuddyQuickAction["id"]) => {
    if (id === "photo" || id === "change_price" || id === "edit_details") {
      setDetailsOpen(true);
    }
    onQuickAction(id);
  };

  const statusLabel = classic
    ? buddyState === "typing"
      ? "Ruošiama…"
      : buddyState === "speaking"
        ? "Atsakymas"
        : theme.portalLabel
    : buddyState === "typing"
      ? "rašo…"
      : buddyState === "speaking"
        ? "kalba…"
        : "VAUTO draugas";

  const headerTitle = classic ? theme.portalLabel : "VAUTO draugas";
  const headerSubtitle = manualFallback
    ? "Rankinis skelbimo formos užpildymas"
    : classic
      ? portalStyleLabel ?? "Patikrinkite skelbimo duomenis"
      : "Padedu paruošti skelbimą";

  return (
    <div
      className={cn(
        manualFallback
          ? "listing-wizard-overlay flex flex-col bg-white"
          : "fixed inset-0 z-[100] flex flex-col transition-colors duration-500 ease-in-out",
        !manualFallback && t.shell
      )}
    >
      {!manualFallback && (
        <BuddyFab mode={buddyState === "speaking" ? "speaking" : "listening"} />
      )}
      <div
        className={cn(
          "flex items-center justify-between border-b px-4 py-3 transition-colors duration-300",
          t.headerBar
        )}
      >
        <div>
          <p className={cn("text-xs font-semibold uppercase tracking-wider", t.title)}>
            {headerTitle}
          </p>
          <p className={cn("text-sm", t.subtitle)}>{headerSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className={cn("rounded-full p-2", t.cancelBtn)}
          aria-label="Uždaryti"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="chameleon-panel-enter flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto max-w-md space-y-4">
          {userPrompt && (
            <div className="flex justify-end">
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl rounded-tr-md px-4 py-3 text-base leading-relaxed transition-colors duration-300",
                  t.userBubble,
                  classic && "rounded-lg"
                )}
              >
                <p className={cn("mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70")}>
                  Jūs
                </p>
                {userPrompt}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            {classic ? (
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2",
                  chameleonTheme === "autoplius" && "border-[#1a56db] bg-[#e8f0fe] text-[#1a56db]",
                  chameleonTheme === "skelbiu" && "border-[#1565c0] bg-[#e3f2fd] text-[#1565c0]",
                  chameleonTheme === "aruodas" && "border-[#c62828] bg-[#ffebee] text-[#c62828]",
                  chameleonTheme === "paslaugos" && "border-[#0f766e] bg-[#e6fffb] text-[#0f766e]",
                  chameleonTheme === "cvbankas" && "border-[#1f4b99] bg-[#eaf1ff] text-[#1f4b99]"
                )}
              >
                <MessageCircle className="h-5 w-5" />
              </div>
            ) : (
              <BuddyAvatar state={buddyState} />
            )}
            <div className="min-w-0 flex-1">
              <p className={cn("mb-1 text-[10px] font-semibold uppercase tracking-wide", t.assistantLabel)}>
                {statusLabel}
              </p>
              <div
                className={cn(
                  "rounded-2xl px-4 py-3 transition-colors duration-300",
                  classic ? "rounded-lg" : "rounded-tl-md",
                  t.aiBubble
                )}
              >
                {!showMessage ? (
                  classic ? (
                    <p className="text-sm opacity-70">Ruošiame atsakymą…</p>
                  ) : (
                    <div className="flex gap-1 py-2">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--vauto-teal)] [animation-delay:0ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--vauto-teal)] [animation-delay:150ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--vauto-teal)] [animation-delay:300ms]" />
                    </div>
                  )
                ) : (
                  <p className={cn("text-base leading-relaxed", classic && "text-[15px]")}>
                    {buddyMessage}
                  </p>
                )}
              </div>

              {showMessage && wizardThread.length > 0 && (
                <div className="mt-3 space-y-2">
                  {wizardThread.map((m, i) => (
                    <div
                      key={`wiz-${i}`}
                      className={cn(
                        "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                        m.role === "user"
                          ? "ml-8 rounded-tr-md bg-[#1a56db]/10 text-[#1e3a5f]"
                          : cn("rounded-tl-md", t.aiBubble)
                      )}
                    >
                      {m.text}
                    </div>
                  ))}
                </div>
              )}

              {showMessage && wizardQuickReplies.length > 0 && onWizardReply && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {wizardQuickReplies.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onWizardReply(r)}
                      className="min-h-[44px] rounded-full border border-[#93c5fd] bg-white px-4 py-2 text-sm font-medium text-[#1d4ed8] transition hover:bg-[#eff6ff]"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}

              {showMessage && (
                <BuddyQuickActions
                  actions={quickActions}
                  onAction={handleAction}
                  classic={classic}
                  themeId={chameleonTheme}
                />
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            className={cn(
              "flex w-full min-h-[48px] items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-colors duration-300",
              t.detailsToggle
            )}
          >
            {detailsOpen ? "Slėpti skelbimo detales" : "Rodyti skelbimo detales"}
            {detailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {detailsOpen && (
            <div
              className={cn(
                "chameleon-panel-enter chameleon-details-panel space-y-4 rounded-2xl p-4 transition-colors duration-500 ease-in-out",
                t.detailsPanel
              )}
            >
              {children}
            </div>
          )}
        </div>
      </div>

      <div
        className={cn(
          "safe-bottom border-t px-4 py-4 backdrop-blur-lg transition-colors duration-300",
          t.headerBar
        )}
      >
        <button
          type="button"
          onClick={onPublish}
          disabled={!canPublish}
          className={cn(
            "w-full min-h-[56px] rounded-2xl text-lg font-bold transition duration-300",
            classic && chameleonTheme === "skelbiu" && "min-h-[60px] rounded-lg",
            classic && chameleonTheme === "aruodas" && "min-h-[56px] rounded-md",
            t.publishBtn,
            t.publishBtnDisabled
          )}
        >
          {canPublish ? "Viskas gerai, publikuoti skelbimą" : publishLabel}
        </button>
      </div>
    </div>
  );
}
