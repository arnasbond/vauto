"use client";
// @disk-refresh 2026-07-08T00:04 — supervisor DOM fixes

import { ArrowUp, Camera, ChevronDown, Loader2, MessageCircle, Mic, Plus, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { useVautoSearch } from "@/context/VautoSearchContext";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import {
  executeConductorRoute,
  conductorPhotoUploadSource,
  conductorSearchQuerySource,
  readConductorSearchExecute,
  conductorShouldDelegateLegacy,
} from "@/lib/vauto-conductor";
import { sanitizeSearchQuery } from "@/lib/vertical-listing-filter";
import { AiModeBadge } from "@/components/AiModeBadge";
import { getVerticalUi } from "@/lib/vertical-presentation";
import { verticalExperienceForQuery } from "@/lib/vertical-presentation";
import { cn } from "@/lib/cn";
import {
  parseViewModeIntent,
  isViewModeOnlyCommand,
} from "@/lib/marketplace-view";
import { stripLegacyCategorySuffixes } from "@/lib/speech-transcript";
import { focusSearchOutcome } from "@/lib/search-results-focus";
import { subscribeHomeReset } from "@/lib/home-reset";
import type { VautoAgentAction } from "@/lib/vauto-agent-client";
import { AI_FIRST_SEARCH_PLACEHOLDER } from "@/lib/ai-first-search-vision";
import type { AgentFlowPhase } from "@/lib/agent-flow-phase";
import { useFlowUiSkin } from "@/hooks/useFlowUiSkin";
import { resolveBrowseAllIntent, createBrowseAllAction } from "@/lib/browse-all-intent";
import { detectSellerListingIntent } from "@/lib/scoring";
import { isTextFirstListingIntent } from "@/lib/listing-conversational-flow";
import { resolveSupervisorChatTurn } from "@/lib/agent-chat-layout";
import { hapticImpactLight } from "@/lib/haptic-feedback";
import { WIZARD_AGENT_EXPAND_EVENT } from "@/lib/ai-conversational-recovery";
import { CHAT_COMPOSER_FOCUS_EVENT } from "@/lib/start-ai-seller-listing";
import { AgentTypingIndicator } from "@/components/home/AgentTypingIndicator";
import { ChatComposerAttachments } from "@/components/home/ChatComposerAttachments";
import {
  MAX_CHAT_COMPOSER_ATTACHMENTS,
  pickNativeChatMedia,
  type ChatComposerAttachment,
  type ChatMediaPickSource,
} from "@/lib/chat-composer-media";
import { splitComposerAttachments } from "@/lib/chat-document-extract";
import { pickAndSendChatPhotos } from "@/lib/chat-photo-upload-flow";
import { prepareChatImagesForAgent } from "@/lib/prepare-chat-images-for-agent";
import { PhotoSourceSheet } from "@/components/photo/PhotoSourceSheet";
import { peekPendingBarcodeOffer } from "@/lib/product-intelligence/barcode-intent-session";
import {
  inferListingFlowState,
  listingFlowComposerPlaceholder,
  listingFlowComposerTextLocked,
} from "@/lib/listing-conversational-flow";
import {
  VISION_UPLOAD_BATCH_SIZE,
  chunkForVisionUpload,
} from "@vauto/shared/listing-photo-policy";
import { isSpeechRecognitionSupported } from "@/lib/wake-word-engine";

const GEMINI_BLUE = "var(--vauto-primary)";

const EMPTY_SEARCH_HINT_ID = "vauto-search-empty-hint";
const EMPTY_SEARCH_HINT =
  "Įveskite, ko ieškote, arba pasirinkite vieną iš pavyzdžių.";

function isBlankMarketplaceQuery(raw: string): boolean {
  return !stripLegacyCategorySuffixes(sanitizeSearchQuery(raw, "final"));
}

export type AiCommandBarPlacement = "hero" | "top" | "inline" | "wizard" | "chat";

export interface AiCommandBarProps {
  placement?: AiCommandBarPlacement;
  phase?: AgentFlowPhase;
  seedQuery?: string | null;
  onSeedConsumed?: () => void;
  /** Fill composer only (no auto-submit) — used by homepage example chips. */
  draftSeed?: string | null;
  onDraftSeedConsumed?: () => void;
  className?: string;
  /** Wizard mode — collapsed FAB until tap or new assistant reply. */
  collapsible?: boolean;
}

/**
 * P10 — unified AI Command Bar: top search, hero, inline, and collapsible wizard FAB.
 */
export function AiCommandBar({
  placement = "inline",
  phase = "idle",
  seedQuery,
  onSeedConsumed,
  draftSeed,
  onDraftSeedConsumed,
  className,
  collapsible = false,
}: AiCommandBarProps) {
  const isWizard = placement === "wizard";
  const isChatBar = placement === "chat";
  const isTopBar = placement === "hero" || placement === "top";

  const {
    requestMediaConsent,
    setSearchInputMode,
    clearVisualSearch,
    showToast,
    listings,
  } = useVauto();
  const { sellerStep, sellerVisionRecoveryActive, aiDraft } = useSellerFlow();
  const {
    searchQuery,
    setSearchQuery,
    setSearchLoading,
    searchLoading,
    setAgentPinnedListings,
    setViewMode,
  } = useVautoSearch();

  const pathname = usePathname();
  const { trackEvent } = useUserBehavior();
  const {
    messages,
    sendAgentMessage,
    busy: agentBusy,
    applyAgentActions,
    openWithGreeting,
    streamThinkingLabel,
    setOpen,
  } = useVautoAgent();
  const skin = useFlowUiSkin();

  const [draftQuery, setDraftQuery] = useState(searchQuery);
  const [isPhotoSearching, setIsPhotoSearching] = useState(false);
  const [wizardExpanded, setWizardExpanded] = useState(!collapsible);
  const [previewPulse, setPreviewPulse] = useState(false);
  const [composerAttachments, setComposerAttachments] = useState<
    ChatComposerAttachment[]
  >([]);
  const [isPickingChatMedia, setIsPickingChatMedia] = useState(false);
  const [photoSourceSheetOpen, setPhotoSourceSheetOpen] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [emptySearchHint, setEmptySearchHint] = useState(false);
  const photoSourceModeRef = useRef<"attach" | "search">("attach");
  const inputRef = useRef<HTMLInputElement>(null);
  const prevAssistantRef = useRef("");

  const showEmptySearchHint = useCallback(() => {
    setEmptySearchHint(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const clearEmptySearchHint = useCallback(() => {
    setEmptySearchHint(false);
  }, []);

  const updateDraftQuery = useCallback((value: string) => {
    setDraftQuery(value);
    setEmptySearchHint(false);
  }, []);

  // Stage 18A/18B — blank only the visible input, keeping the canonical
  // `searchQuery` alive so the editable AI interpretation chips render above the
  // results (the readout is tied to `searchQuery`, not the ephemeral input).
  const clearDraftOnly = useCallback(() => {
    setDraftQuery("");
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setDraftQuery("");
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }, [searchQuery]);

  useEffect(() => {
    return subscribeHomeReset(() => {
      setIsPhotoSearching(false);
      setDraftQuery("");
      setComposerAttachments([]);
      setVoiceListening(false);
    });
  }, []);

  const handleVoiceInput = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!isSpeechRecognitionSupported()) {
      showToast("Balso įvestis šiame įrenginyje nepalaikoma", "info");
      inputRef.current?.focus();
      return;
    }
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return;
    try {
      const rec = new Ctor();
      rec.lang = "lt-LT";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      setVoiceListening(true);
      rec.onresult = (ev) => {
        const text = ev.results?.[0]?.[0]?.transcript?.trim();
        if (text) {
          setDraftQuery(text);
          setEmptySearchHint(false);
        }
        setVoiceListening(false);
        requestAnimationFrame(() => inputRef.current?.focus());
      };
      rec.onerror = () => {
        setVoiceListening(false);
        showToast("Nepavyko atpažinti balso — bandykite dar kartą", "info");
      };
      rec.onend = () => setVoiceListening(false);
      rec.start();
    } catch {
      setVoiceListening(false);
      showToast("Nepavyko paleisti mikrofono", "info");
    }
  }, [showToast]);

  const activeVertical =
    sellerStep !== "idle"
      ? "marketplace"
      : verticalExperienceForQuery(searchQuery).vertical;
  const ui = useMemo(() => getVerticalUi(activeVertical), [activeVertical]);

  const zeroUiActive = agentBusy || searchLoading || isPhotoSearching;

  const wardrobeSearchOnly =
    pathname === "/fashion" || pathname === "/fashion/";

  // Stage 18A/18B — keep the user's query as the canonical search query so the
  // editable AI interpretation chips render above the results. The agent still
  // owns the displayed listings (agent-pinned), so this does not change result
  // derivation (18C). We set it immediately and re-assert after the current
  // microtask/task drains so the agent's own deferred `setSearchQuery("")`
  // (applied while completing a search action) cannot blank it and dismantle
  // the readout.
  const persistInterpretationQuery = useCallback(
    (q: string) => {
      setSearchQuery(q);
      const t = window.setTimeout(() => {
        setSearchQuery(q);
      }, 0);
      // The timeout is intentional; we do not cancel it here because a fresh
      // `commitSearch` for a different query will overwrite it naturally.
      void t;
    },
    [setSearchQuery]
  );

  const scrollToResults = () => {
    document
      .getElementById("listing-results")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const syncGridFromAgentActions = useCallback(
    (actions: VautoAgentAction | undefined) => {
      if (!actions || actions.type === "none") return;
      // Stage 18A/18B — keep the canonical search query (so the editable AI
      // readout chips keep showing); only clear the visible input text.
      clearDraftOnly();
      applyAgentActions(actions);
      if (actions.type === "search") {
        focusSearchOutcome(actions.listingIds.length);
      } else if (actions.type === "browse_all") {
        focusSearchOutcome(actions.listingCount ?? 1);
        scrollToResults();
      } else if (
        actions.type === "empty_search" ||
        actions.type === "apply_ui_filters" ||
        actions.type === "navigate_to_screen"
      ) {
        focusSearchOutcome(0);
      }
    },
    [applyAgentActions, clearDraftOnly]
  );

  const commitSearch = useCallback(
    async (raw: string) => {
      const q = stripLegacyCategorySuffixes(sanitizeSearchQuery(raw, "final"));
      if (!q) {
        showEmptySearchHint();
        return;
      }
      clearEmptySearchHint();

      trackEvent("search_submit", {
        query: q,
        voice: false,
        wardrobeMode: wardrobeSearchOnly,
        pathname: pathname ?? "/",
      });

      setSearchInputMode("text");
      clearVisualSearch({ keepInputMode: true });

      const viewIntent = parseViewModeIntent(q);
      if (viewIntent) setViewMode(viewIntent);

      if (isViewModeOnlyCommand(q)) {
        setDraftQuery(q);
        setSearchQuery(q);
        setAgentPinnedListings(null);
        scrollToResults();
        return;
      }

      if (
        resolveBrowseAllIntent(raw, q) &&
        !isTextFirstListingIntent(raw) &&
        !isTextFirstListingIntent(q) &&
        !detectSellerListingIntent(raw) &&
        !detectSellerListingIntent(q)
      ) {
        const activeCount = listings.filter(
          (l) => !l.banned && l.price > 0 && l.status !== "sold"
        ).length;
        const actions = createBrowseAllAction(activeCount);
        setDraftQuery("");
        setSearchQuery("");
        setSearchLoading(true);
        try {
          syncGridFromAgentActions(actions);
          openWithGreeting(actions.replyMessage, { openSheet: false });
        } finally {
          setSearchLoading(false);
        }
        return;
      }

      setDraftQuery(q);
      clearVisualSearch({ keepInputMode: true });
      setSearchLoading(true);
      try {
        setAgentPinnedListings(null);
        const route = await executeConductorRoute({
          ...conductorSearchQuerySource("AiCommandBar"),
          payload: { query: q, wardrobeSearchOnly },
        });
        if (!conductorShouldDelegateLegacy(route)) {
          const exec = readConductorSearchExecute(route);
          if (exec?.agentResult.actions) {
            syncGridFromAgentActions(exec.agentResult.actions);
          } else if (exec?.agentResult.ok) {
            scrollToResults();
          }
          persistInterpretationQuery(q);
          scrollToResults();
          return;
        }
        const res = await sendAgentMessage(q, { fromSearchBar: true });
        if (res.actions) syncGridFromAgentActions(res.actions);
        else if (res.ok) clearDraftOnly();
        else if (res.reply) {
          scrollToResults();
        }
        persistInterpretationQuery(q);
      } finally {
        setSearchLoading(false);
      }
    },
    [
      clearVisualSearch,
      setAgentPinnedListings,
      setSearchInputMode,
      setSearchQuery,
      setSearchLoading,
      setViewMode,
      sendAgentMessage,
      syncGridFromAgentActions,
      clearDraftOnly,
      pathname,
      trackEvent,
      wardrobeSearchOnly,
      listings,
      openWithGreeting,
      showEmptySearchHint,
      clearEmptySearchHint,
      persistInterpretationQuery,
    ]
  );

  const lastSeedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!seedQuery?.trim() || seedQuery === lastSeedRef.current) return;
    lastSeedRef.current = seedQuery;
    setDraftQuery(seedQuery);
    void commitSearch(seedQuery).finally(() => onSeedConsumed?.());
  }, [seedQuery, commitSearch, onSeedConsumed]);

  const lastDraftSeedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!draftSeed?.trim() || draftSeed === lastDraftSeedRef.current) return;
    lastDraftSeedRef.current = draftSeed;
    setDraftQuery(draftSeed);
    setEmptySearchHint(false);
    onDraftSeedConsumed?.();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [draftSeed, onDraftSeedConsumed]);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (placement === "wizard" || placement === "chat" || phase === "listing_processing") {
        const trimmed = draftQuery.trim();
        const attachments = isChatBar ? composerAttachments : [];
        // Do NOT block on agentBusy — Vision early_ack soft-unlocks concurrent chat.
        if (
          (!trimmed && !attachments.length) ||
          searchLoading ||
          isPhotoSearching
        ) {
          return;
        }
        if (
          placement !== "chat" &&
          resolveBrowseAllIntent(trimmed) &&
          !isTextFirstListingIntent(trimmed) &&
          !detectSellerListingIntent(trimmed)
        ) {
          setDraftQuery("");
          void commitSearch(trimmed);
          if (collapsible) {
            void hapticImpactLight();
            setWizardExpanded(false);
          }
          return;
        }
        const msg = trimmed;
        const selected = attachments.slice(0, MAX_CHAT_COMPOSER_ATTACHMENTS);
        // Immediate clean slate — never leave text/photos stuck while Vision/network runs.
        setDraftQuery("");
        if (isChatBar) setComposerAttachments([]);
        if (inputRef.current) inputRef.current.value = "";
        const {
          imageUrls,
          documents,
          documentBadges,
        } = splitComposerAttachments(selected);
        try {
          const prepared = imageUrls.length
            ? await prepareChatImagesForAgent(imageUrls)
            : {
                listingImageUrls: [] as string[],
                agentVisionUrls: [] as string[],
                suspectedDocumentUrls: [] as string[],
              };
          const allWire = prepared.agentVisionUrls.length
            ? prepared.agentVisionUrls
            : prepared.listingImageUrls;
          const visionBatches = chunkForVisionUpload(
            allWire,
            VISION_UPLOAD_BATCH_SIZE
          );
          let res: Awaited<ReturnType<typeof sendAgentMessage>> | null = null;
          for (let i = 0; i < Math.max(visionBatches.length, 1); i++) {
            const batch = visionBatches[i] ?? [];
            const isFirst = i === 0;
            const batchMsg =
              isFirst
                ? msg
                : visionBatches.length > 1
                  ? `[nuotraukos įkeltos] (${i + 1}/${visionBatches.length})`
                  : msg;
            res = await sendAgentMessage(batchMsg, {
              ...(batch.length
                ? {
                    sessionImageUrls: batch,
                    pendingImageUrls: batch,
                    ...(isFirst && prepared.suspectedDocumentUrls?.length
                      ? { documentImageUrls: prepared.suspectedDocumentUrls }
                      : {}),
                  }
                : {}),
              ...(isFirst && documents.length
                ? { pendingDocuments: documents }
                : {}),
              ...(isFirst && documentBadges.length
                ? { documentAttachments: documentBadges }
                : {}),
              ...(!isFirst ? { skipUserBubble: true } : {}),
            });
            if (!res.ok) break;
          }
          if (res && res.ok === false) {
            // Hard failure only — restore composer so the user can retry.
            setDraftQuery(msg);
            if (isChatBar && selected.length) {
              setComposerAttachments(selected);
            }
          }
        } catch (err) {
          setDraftQuery(msg);
          if (isChatBar && selected.length) {
            setComposerAttachments(selected);
          }
          const raw = err instanceof Error ? err.message : String(err ?? "");
          showToast(
            /413|payload|failed to fetch|network/i.test(raw)
              ? "Failų siuntimas nepavyko — bandykite dar kartą arba įkelkite po 2–3."
              : "Nepavyko išsiųsti žinutės — bandykite dar kartą.",
            "info"
          );
        }
        if (collapsible) {
          void hapticImpactLight();
          if (!sellerVisionRecoveryActive) setWizardExpanded(false);
        }
        return;
      }
      if (isBlankMarketplaceQuery(draftQuery)) {
        showEmptySearchHint();
        return;
      }
      clearEmptySearchHint();
      void commitSearch(draftQuery);
      inputRef.current?.blur();
    },
    [
      placement,
      phase,
      draftQuery,
      searchLoading,
      isPhotoSearching,
      sendAgentMessage,
      commitSearch,
      collapsible,
      sellerVisionRecoveryActive,
      isChatBar,
      composerAttachments,
      showToast,
      showEmptySearchHint,
      clearEmptySearchHint,
    ]
  );

  const runChatMediaPick = useCallback(
    (source: ChatMediaPickSource) => {
      if (isPickingChatMedia || agentBusy) return;
      if (composerAttachments.length >= MAX_CHAT_COMPOSER_ATTACHMENTS) {
        showToast(
          `Galima pridėti iki ${MAX_CHAT_COMPOSER_ATTACHMENTS} failų.`,
          "info"
        );
        return;
      }
      requestMediaConsent(() => {
        void (async () => {
          setIsPickingChatMedia(true);
          try {
            const picked = await pickNativeChatMedia(
              composerAttachments.length,
              source
            );
            if (picked.length) {
              setComposerAttachments((prev) =>
                [...prev, ...picked].slice(0, MAX_CHAT_COMPOSER_ATTACHMENTS)
              );
            }
          } catch {
            showToast(
              "Nepavyko pridėti failo — bandykite dar kartą.",
              "info"
            );
          } finally {
            setIsPickingChatMedia(false);
          }
        })();
      });
    },
    [
      agentBusy,
      composerAttachments.length,
      isPickingChatMedia,
      requestMediaConsent,
      showToast,
    ]
  );

  const handleChatMediaAttach = useCallback(() => {
    if (isPickingChatMedia || agentBusy) return;
    if (composerAttachments.length >= MAX_CHAT_COMPOSER_ATTACHMENTS) {
      showToast(
        `Galima pridėti iki ${MAX_CHAT_COMPOSER_ATTACHMENTS} failų.`,
        "info"
      );
      return;
    }
    photoSourceModeRef.current = "attach";
    setPhotoSourceSheetOpen(true);
  }, [
    agentBusy,
    composerAttachments.length,
    isPickingChatMedia,
    showToast,
  ]);

  const handlePhotoSearch = () => {
    if (isChatBar) {
      handleChatMediaAttach();
      return;
    }
    if (isPhotoSearching || agentBusy) return;
    photoSourceModeRef.current = "search";
    setPhotoSourceSheetOpen(true);
  };

  const handlePhotoSourceSelect = useCallback(
    (source: ChatMediaPickSource) => {
      setPhotoSourceSheetOpen(false);
      if (photoSourceModeRef.current === "attach") {
        runChatMediaPick(source);
        return;
      }
      void executeConductorRoute({
        ...conductorPhotoUploadSource("AiCommandBar"),
        payload: { photoCount: 1, wardrobeSearchOnly },
      });
      pickAndSendChatPhotos({
        requestMediaConsent,
        sendAgentMessage,
        setOpen,
        source,
        onBusyChange: setIsPhotoSearching,
        onErrorMessage: (message) => showToast(message, "info"),
      });
    },
    [
      requestMediaConsent,
      runChatMediaPick,
      sendAgentMessage,
      setOpen,
      showToast,
      wardrobeSearchOnly,
    ]
  );

  const lastAssistant = useMemo(() => {
    return resolveSupervisorChatTurn(messages).assistant?.text ?? "";
  }, [messages]);

  const listingFlowState = inferListingFlowState({
    listingFlowState: aiDraft?.listingFlowState,
    hasDraft: Boolean(aiDraft?.title?.trim()),
    photoCount: aiDraft?.orderedImageUrls?.length ?? 0,
  });
  const flowPlaceholder = listingFlowComposerPlaceholder(listingFlowState);
  const confirmationLocked = listingFlowComposerTextLocked(listingFlowState);

  const backgroundAnalyzing = Boolean(streamThinkingLabel?.trim());
  // Chat/wizard: never hard-lock on agentBusy (Vision early_ack soft-unlocks concurrent chat).
  // Search bars still respect agentBusy for normal turns.
  const hardBusy = searchLoading || isPhotoSearching;
  const busy = agentBusy || hardBusy;
  const listingComposerLocked = hardBusy || confirmationLocked;
  const searchComposerLocked = busy;
  const hasAssistantPing = Boolean(lastAssistant) || busy || backgroundAnalyzing;

  const toggleWizardExpanded = useCallback((next: boolean) => {
    void hapticImpactLight();
    setWizardExpanded(next);
    if (next) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!isWizard || !collapsible || wizardExpanded) return;
    if (!lastAssistant || lastAssistant === prevAssistantRef.current) return;
    prevAssistantRef.current = lastAssistant;
    setPreviewPulse(true);
    const t = window.setTimeout(() => setPreviewPulse(false), 2400);
    return () => window.clearTimeout(t);
  }, [lastAssistant, isWizard, collapsible, wizardExpanded]);

  useEffect(() => {
    const onExpand = () => toggleWizardExpanded(true);
    window.addEventListener(WIZARD_AGENT_EXPAND_EVENT, onExpand);
    return () => window.removeEventListener(WIZARD_AGENT_EXPAND_EVENT, onExpand);
  }, [toggleWizardExpanded]);

  useEffect(() => {
    const onFocusComposer = () => {
      if (isWizard && collapsible) {
        setWizardExpanded(true);
      }
      requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
      });
    };
    window.addEventListener(CHAT_COMPOSER_FOCUS_EVENT, onFocusComposer);
    return () =>
      window.removeEventListener(CHAT_COMPOSER_FOCUS_EVENT, onFocusComposer);
  }, [isWizard, collapsible]);

  useEffect(() => {
    if (sellerVisionRecoveryActive && collapsible) {
      toggleWizardExpanded(true);
    }
  }, [sellerVisionRecoveryActive, collapsible, toggleWizardExpanded]);

  const wizardPlaceholder =
    flowPlaceholder ??
    (sellerVisionRecoveryActive
      ? "Įveskite objekto / prekės pavadinimą arba lokaciją…"
      : phase === "listing_processing"
      ? "Agentas apdoroja — galite rašyti patikslinimus…"
      : skin.variant === "spinta"
        ? "Rašykite Spintos sekretorei — pvz. „pakeisk dydį į M“"
        : "Rašykite — pvz. „pakeisk kainą“ arba „pridėk defektus“");

  const inputPlaceholder = isWizard
    ? wizardPlaceholder
    : isChatBar
      ? flowPlaceholder ?? "Rašykite atsakymą…"
    : isTopBar
      ? AI_FIRST_SEARCH_PLACEHOLDER
      : "Rašykite paiešką… (nuotrauka: nuskenuosiu brūkšninį kodą)";

  const composerFormClass = cn(
    "pointer-events-auto flex items-center gap-2 rounded-2xl border p-1.5 pl-3.5 shadow-lg backdrop-blur-xl",
    isWizard ? skin.composerBorder : "border-[var(--vauto-border)]",
    isWizard ? skin.composerBg : "bg-[var(--vauto-card-bg)]"
  );

  const composerInputClass =
    "min-w-0 flex-1 border-none bg-transparent text-sm text-[var(--vauto-text-main)] outline-none placeholder:text-[#4b5563] vauto-body-text";

  const composerButtonClass = isWizard
    ? cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition disabled:opacity-40",
        skin.composerButton
      )
    : "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--vauto-primary)] text-[var(--vauto-primary-contrast)] transition disabled:opacity-40";

  if (isWizard && collapsible && !wizardExpanded) {
    const barcodeOffer = peekPendingBarcodeOffer();
    const previewLine = (barcodeOffer?.message ?? lastAssistant).replace(/\s+/g, " ").trim();
    const previewSnippet =
      previewLine.length > 88 ? `${previewLine.slice(0, 88)}…` : previewLine;

    return (
      <div
        className={cn(
          "ai-wizard-fab-stack pointer-events-none fixed z-50 flex flex-col items-end",
          "bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4",
          className
        )}
      >
        {previewSnippet && (
          <div
            className={cn(
              "ai-wizard-fab-preview pointer-events-none mb-2 max-w-[min(17rem,calc(100vw-5.5rem))] rounded-2xl border px-3 py-2 text-left text-[11px] leading-snug shadow-lg backdrop-blur-md vauto-body-text",
              "border-[var(--vauto-border)] bg-[var(--vauto-card-bg)]/95 text-[var(--vauto-text-muted)]",
              previewPulse && "ai-wizard-fab-preview-pulse"
            )}
            role="status"
            aria-live="polite"
          >
            <Sparkles
              className={cn("mb-0.5 inline h-3 w-3 text-[var(--vauto-primary)]")}
              aria-hidden
            />{" "}
            {previewSnippet}
          </div>
        )}
        <button
          type="button"
          className={cn(
            "ai-wizard-fab pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full border shadow-xl transition-transform duration-300 hover:scale-105 active:scale-95",
            skin.composerBorder,
            skin.composerBg
          )}
          onClick={() => toggleWizardExpanded(true)}
          aria-label="Atidaryti VAUTO asistentą"
          aria-expanded={false}
        >
          {busy ? (
            <Loader2 className={cn("h-6 w-6 animate-spin", skin.composerAccentIcon)} />
          ) : (
            <MessageCircle className={cn("h-6 w-6", skin.composerAccentIcon)} />
          )}
          {hasAssistantPing && !busy && (
            <span
              className="ai-wizard-fab-ping absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--vauto-accent)] ring-2 ring-[var(--vauto-bg)]"
              aria-hidden
            >
              <Sparkles className="h-2.5 w-2.5 text-white" />
            </span>
          )}
        </button>
      </div>
    );
  }

  if (isWizard) {
    return (
      <>
        <div
          className={cn(
            "ai-wizard-composer pointer-events-none fixed z-50",
            collapsible
              ? "ai-wizard-composer-floating bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 left-auto w-[min(22rem,calc(100vw-2rem))]"
              : "inset-x-0 bottom-0",
            collapsible && "ai-wizard-composer-expanded"
          )}
          aria-label="VAUTO AI komandų juosta"
        >
          <div className={cn(collapsible ? "px-0" : "mx-auto w-full max-w-lg px-3 md:max-w-3xl md:px-0", "pb-0")}>
            {isWizard && collapsible && (
              <div className="pointer-events-auto mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => toggleWizardExpanded(false)}
                  className="flex items-center gap-1 rounded-full border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] px-3 py-1 text-[11px] text-[var(--vauto-text-muted)] shadow-sm transition hover:bg-[var(--vauto-bg)]"
                  aria-label="Suskleisti asistentą"
                >
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                  Suskleisti
                </button>
              </div>
            )}
            {(busy || backgroundAnalyzing) && isWizard && (
              <div className="pointer-events-auto mb-1.5">
                <AgentTypingIndicator variant="inline" label={streamThinkingLabel} />
              </div>
            )}
            {lastAssistant && isWizard && !busy && !backgroundAnalyzing && (
              <p
                className={cn(
                  "pointer-events-auto mb-1.5 line-clamp-3 rounded-xl border px-3 py-2 text-[12px] leading-relaxed shadow-md backdrop-blur-md vauto-body-text",
                  skin.composerBorder,
                  skin.composerBg,
                  "text-[var(--vauto-text-muted)]"
                )}
              >
                <Sparkles
                  className={cn("mr-1 inline h-3 w-3", skin.composerAccentIcon)}
                  aria-hidden
                />
                {lastAssistant.slice(0, 220)}
                {lastAssistant.length > 220 ? "…" : ""}
              </p>
            )}
            <form onSubmit={(e) => void handleSubmit(e)} className={composerFormClass}>
              <input
                ref={inputRef}
                type="text"
                value={draftQuery}
                onChange={(e) => setDraftQuery(e.target.value)}
                placeholder={inputPlaceholder}
                disabled={hardBusy}
                className={composerInputClass}
                enterKeyHint={isWizard ? "send" : "search"}
                aria-label="VAUTO AI komanda"
              />
              <button
                type="submit"
                disabled={!draftQuery.trim() || hardBusy}
                className={composerButtonClass}
                aria-label={isWizard ? "Siųsti žinutę" : "Ieškoti"}
              >
                {hardBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isWizard ? (
                  <ArrowUp className="h-4 w-4" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  const canSendChat =
    Boolean(draftQuery.trim()) || composerAttachments.length > 0;

  return (
    <>
      <div className="w-full min-w-0">
      <form
        className={cn(
          "border shadow-sm transition-colors",
          isChatBar &&
            "agent-chat-composer flex w-full flex-col gap-1.5 rounded-2xl border-[var(--vauto-primary)]/20 bg-[var(--vauto-bg)] p-2 shadow-md",
          !isChatBar && "flex w-full items-center",
          isTopBar
            ? "home-ai-hero-search home-ai-copilot-bar ds-ai-glow rounded-full py-2 pl-4 pr-2 shadow-md sm:pl-5 sm:pr-2"
            : !isChatBar && "vauto-surface-panel rounded-xl py-1.5 pl-3.5 pr-2",
          zeroUiActive && "zero-ui-search-active",
          emptySearchHint && !isChatBar && "border-[var(--ds-ai,#059669)]/45",
          className
        )}
        style={{
          borderColor: isTopBar
            ? "color-mix(in srgb, var(--ds-ai, #059669) 35%, var(--vauto-border))"
            : ui.searchBorder,
        }}
        onSubmit={(e) => void handleSubmit(e)}
        role={isChatBar ? undefined : "search"}
        aria-label={isChatBar ? "VAUTO asistento atsakymas" : "Skelbimų paieška"}
      >
        {isChatBar && composerAttachments.length > 0 ? (
          <ChatComposerAttachments
            items={composerAttachments}
            onRemove={(index) =>
              setComposerAttachments((prev) => prev.filter((_, i) => i !== index))
            }
            className="px-0.5"
          />
        ) : null}

        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2",
            (isTopBar || isChatBar) && "w-full"
          )}
        >
        {isChatBar ? (
          <button
            type="button"
            onClick={handleChatMediaAttach}
            disabled={
              listingComposerLocked ||
              isPickingChatMedia ||
              composerAttachments.length >= MAX_CHAT_COMPOSER_ATTACHMENTS
            }
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--vauto-primary)] transition hover:bg-[var(--vauto-primary)]/10 disabled:opacity-40"
            aria-label="Pridėti failą"
            title="Pridėti nuotrauką, PDF ar dokumentą"
          >
            {isPickingChatMedia ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-5 w-5" aria-hidden />
            )}
          </button>
        ) : (
          <Sparkles
            className={cn(
              "shrink-0 transition-opacity",
              isTopBar ? "h-5 w-5" : "h-4 w-4",
              agentBusy && "zero-ui-icon-pulse"
            )}
            style={{ color: isTopBar ? "var(--ds-ai, var(--vauto-primary))" : GEMINI_BLUE }}
            aria-hidden
          />
        )}

        <input
          ref={inputRef}
          type={isChatBar ? "text" : "search"}
          name={isChatBar ? undefined : "q"}
          role={isChatBar ? undefined : "searchbox"}
          value={draftQuery}
          onChange={(e) => updateDraftQuery(e.target.value)}
          placeholder={inputPlaceholder}
          enterKeyHint={isChatBar ? "send" : "search"}
          className={cn(
            "min-w-0 flex-1 border-none bg-transparent outline-none vauto-body-text",
            isTopBar
              ? "truncate text-[15px] text-[var(--vauto-text-main)] caret-[var(--ds-ai,#059669)] placeholder:text-[#4b5563]"
              : "text-sm text-[var(--vauto-text-main)] caret-[var(--vauto-primary)] placeholder:text-[#4b5563]"
          )}
          disabled={isChatBar ? listingComposerLocked : searchComposerLocked}
          readOnly={isChatBar && confirmationLocked}
          autoComplete="off"
          aria-invalid={!isChatBar && emptySearchHint ? true : undefined}
          aria-describedby={
            !isChatBar && emptySearchHint ? EMPTY_SEARCH_HINT_ID : undefined
          }
        />

        <div
          className={cn(
            "ml-auto flex shrink-0 items-center",
            isTopBar ? "gap-1" : "gap-1.5"
          )}
        >
        <button
          type="submit"
          disabled={
            (isChatBar ? listingComposerLocked : searchComposerLocked) ||
            (isChatBar ? !canSendChat : false)
          }
          className={cn(
            "flex shrink-0 items-center justify-center gap-1 rounded-xl font-semibold text-white transition disabled:opacity-40",
            isChatBar
              ? "h-10 min-w-[2.75rem] bg-[var(--vauto-primary)] px-3 text-[var(--vauto-primary-contrast)]"
              : isTopBar
              ? "h-10 w-10 text-[var(--ds-ai-contrast,#fff)] hover:opacity-90"
              : "h-10 w-10 bg-[var(--vauto-primary)] text-[var(--vauto-primary-contrast)]"
          )}
          style={
            isTopBar && !isChatBar
              ? { background: "var(--ds-ai-gradient)" }
              : undefined
          }
          aria-label={isChatBar ? "Siųsti" : "Ieškoti"}
        >
          {(isChatBar ? hardBusy : busy) ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isChatBar ? (
            <>
              <ArrowUp className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline text-sm">Siųsti</span>
            </>
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden />
          )}
        </button>

        {!isChatBar && isTopBar ? (
          <button
            type="button"
            onClick={handleVoiceInput}
            disabled={searchComposerLocked || voiceListening}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition disabled:opacity-40",
              voiceListening
                ? "bg-[var(--ds-ai-soft)] text-[var(--ds-ai)]"
                : "text-[var(--ds-ai)] hover:bg-[var(--ds-ai-soft)]"
            )}
            aria-label={voiceListening ? "Klausoma…" : "Balso įvestis"}
            title="Balso įvestis"
            aria-pressed={voiceListening}
          >
            {voiceListening ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <Mic className="h-5 w-5" aria-hidden />
            )}
          </button>
        ) : null}

        {!isChatBar ? (
        <button
          type="button"
          onClick={handlePhotoSearch}
          disabled={isPhotoSearching}
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition hover:bg-[var(--vauto-bg)] disabled:opacity-40",
            isTopBar
              ? "text-[var(--ds-ai)] hover:bg-[var(--ds-ai-soft)]"
              : "text-[var(--vauto-primary)]",
            !isTopBar && "rounded-lg"
          )}
          aria-label="Vision AI paieška pagal nuotrauką"
          title="Vision AI — nuotrauka"
        >
          {isPhotoSearching ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Camera className="h-5 w-5" />
          )}
        </button>
        ) : null}
        </div>
        </div>
      </form>
      {!isChatBar && emptySearchHint ? (
        <p
          id={EMPTY_SEARCH_HINT_ID}
          data-search-empty-hint
          className="mt-1.5 max-w-full px-1 text-[13px] leading-snug text-[var(--ds-text-secondary,var(--vauto-muted))] [overflow-wrap:anywhere]"
        >
          {EMPTY_SEARCH_HINT}
        </p>
      ) : null}
      </div>

      {!isTopBar && !isChatBar && (
        <>
          <p className="mt-2 text-center text-[11px] text-[var(--vauto-text-muted)]">
            📷 Nuotrauka — pokalbyje pasirinkite ieškoti ar parduoti. Tekstas — greitas Gemini chat.
          </p>
          <div className="mt-1.5 flex justify-center">
            <AiModeBadge compact />
          </div>
        </>
      )}

      <PhotoSourceSheet
        open={photoSourceSheetOpen}
        onClose={() => setPhotoSourceSheetOpen(false)}
        onSelect={handlePhotoSourceSelect}
      />
    </>
  );
}
