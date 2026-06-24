"use client";

import { Loader2, Mic, Send, Sparkles, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useVauto } from "@/context/VautoContext";
import { apiVautoAgent } from "@/lib/api/client";
import { sanitizeSpeechTranscript } from "@/lib/speech-transcript";
import {
  compactListingsForAgent,
  mapAgentDraftToListing,
  registerAgentErrorReporter,
  resolveAgentUserRole,
  type AgentChatMessage,
} from "@/lib/vauto-agent-client";
import { registerWanted } from "@/lib/matching-service";
import { useAdminProjectContextForAgent } from "@/context/AdminProjectContext";
import { isVoiceSearchSupported, startVoiceSearch } from "@/lib/voice-search";

interface VautoAgentContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  messages: AgentChatMessage[];
  busy: boolean;
  sendAgentMessage: (text: string) => Promise<void>;
  reportAgentError: (code: string, message?: string) => void;
}

const VautoAgentContext = createContext<VautoAgentContextValue | null>(null);

export function VautoAgentProvider({ children }: { children: ReactNode }) {
  const {
    listings,
    user,
    setSearchQuery,
    setSearchInputMode,
    applyAgentListingDraft,
    setListingBanned,
    showToast,
    isAuthenticated,
    openAuthModal,
    subscribeWishlist,
    rankedListings,
    searchQuery,
  } = useVauto();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AgentChatMessage[]>([
    {
      role: "assistant",
      text: "Sveiki! Aš esu VAUTO asistentas. Galiu padėti rasti skelbimus, paruošti naują skelbimą ar patarti dėl kainos. Kuo galiu padėti?",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const adminProjectContext = useAdminProjectContextForAgent();
  const [lastError, setLastError] = useState<
    { code: string; message?: string } | undefined
  >();

  const applyActions = useCallback(
    (actions: import("@/lib/vauto-agent-client").VautoAgentAction) => {
      if (actions.type === "search") {
        setSearchInputMode("text");
        setSearchQuery(actions.searchQuery);
        showToast(`Radau ${actions.listingIds.length} skelbimų`, "success");
        document
          .getElementById("listing-results")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (actions.type === "listing_draft") {
        const draft = mapAgentDraftToListing(actions.listingDraft);
        applyAgentListingDraft(draft, actions.imageUrl);
        setOpen(false);
      }
      if (actions.type === "block_listing" && actions.listingId) {
        setListingBanned(actions.listingId, true);
        showToast(
          actions.listingTitle
            ? `AI užblokavo: ${actions.listingTitle}`
            : `Skelbimas užblokuotas (${actions.listingId})`,
          "success"
        );
      }
      if (actions.type === "empty_search") {
        setSearchInputMode("text");
        setSearchQuery(actions.searchQuery);
        document
          .getElementById("listing-results")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (actions.type === "register_wanted") {
        void registerWanted({
          query: actions.query,
          isAuthenticated,
          openAuthModal,
          subscribeWishlist,
          onSuccess: (msg) => showToast(msg, "success"),
          onError: (msg) => showToast(msg, "error"),
        });
      }
    },
    [
      applyAgentListingDraft,
      isAuthenticated,
      openAuthModal,
      setListingBanned,
      setSearchInputMode,
      setSearchQuery,
      showToast,
      subscribeWishlist,
    ]
  );

  const sendAgentMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      const userMsg: AgentChatMessage = { role: "user", text: trimmed };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setBusy(true);

      try {
        const res = await apiVautoAgent({
          messages: nextMessages.map((m) => ({ role: m.role, text: m.text })),
          context: {
            userCity: user.city || "Lietuva",
            userRole: resolveAgentUserRole(user),
            contact: user.phone || "+370 612 34567",
            listings: compactListingsForAgent(listings),
            lastError,
            isAuthenticated,
            searchResultCount: searchQuery.trim() ? rankedListings.length : undefined,
            lastSearchQuery: searchQuery.trim() || undefined,
          },
          ...(adminProjectContext ? { adminProjectContext } : {}),
        });

        if (!res?.reply) {
          showToast("AI agentas laikinai nepasiekiamas", "error");
          return;
        }

        setLastError(undefined);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: res.reply,
            toolCalls: res.toolCalls,
          },
        ]);
        applyActions(res.actions);
      } catch (e) {
        showToast(
          e instanceof Error ? e.message : "Nepavyko susisiekti su AI agentu",
          "error"
        );
      } finally {
        setBusy(false);
      }
    },
    [
      applyActions,
      busy,
      lastError,
      listings,
      messages,
      showToast,
      user,
      isAuthenticated,
      rankedListings,
      searchQuery,
      adminProjectContext,
    ]
  );

  const reportAgentError = useCallback((code: string, message?: string) => {
    setLastError({ code, message });
    if (open) {
      void sendAgentMessage(
        `Sistema praneša apie klaidą: ${code}. ${message ?? ""}`
      );
    }
  }, [open, sendAgentMessage]);

  useEffect(() => {
    registerAgentErrorReporter(reportAgentError);
    return () => registerAgentErrorReporter(null);
  }, [reportAgentError]);

  const value = useMemo(
    () => ({
      open,
      setOpen,
      messages,
      busy,
      sendAgentMessage,
      reportAgentError,
    }),
    [open, messages, busy, sendAgentMessage, reportAgentError]
  );

  return (
    <VautoAgentContext.Provider value={value}>
      {children}
      <VautoAgentSheet />
    </VautoAgentContext.Provider>
  );
}

export function useVautoAgent(): VautoAgentContextValue {
  const ctx = useContext(VautoAgentContext);
  if (!ctx) throw new Error("useVautoAgent must be used within VautoAgentProvider");
  return ctx;
}

function VautoAgentSheet() {
  const { open, setOpen, messages, busy, sendAgentMessage } = useVautoAgent();
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const voiceSessionRef = useRef<ReturnType<typeof startVoiceSearch> | null>(null);

  useEffect(() => {
    return () => voiceSessionRef.current?.cancel();
  }, []);

  const handleVoice = () => {
    if (recording) {
      voiceSessionRef.current?.stop();
      return;
    }
    if (!isVoiceSearchSupported()) return;
    setRecording(true);
    const session = startVoiceSearch({
      onInterim: (text) => {
        if (text.trim()) setInput(sanitizeSpeechTranscript(text));
      },
    });
    voiceSessionRef.current = session;
    void session.promise.then((text) => {
      setRecording(false);
      voiceSessionRef.current = null;
      if (text?.trim()) setInput(sanitizeSpeechTranscript(text));
    });
  };

  if (!open) return <VautoAgentFab />;

  return (
    <>
      <VautoAgentFab />
      <div
        className="fixed inset-0 z-[240] flex flex-col bg-white"
        role="dialog"
        aria-modal="true"
        aria-label="VAUTO AI asistentas"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[#e5e7eb] px-4 py-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#6b7280] hover:bg-[#f3f4f6]"
            aria-label="Uždaryti"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex flex-1 items-center justify-center gap-2 pr-9">
            <Sparkles className="h-4 w-4 text-[#1167b1]" />
            <h2 className="font-display text-base font-bold text-[#111827]">
              VAUTO asistentas
            </h2>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 pb-28">
          {messages.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={`mb-3 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "rounded-tr-md bg-[#1167b1] text-white"
                    : "rounded-tl-md bg-[#f3f4f6] text-[#111827]"
                }`}
              >
                {m.text}
                {m.toolCalls?.length ? (
                  <p className="mt-2 text-[10px] uppercase tracking-wide opacity-60">
                    {m.toolCalls.map((t) => t.name).join(" · ")}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-[#6b7280]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Galvoju ir vykdau veiksmus…
            </div>
          )}
        </div>

        <form
          className="fixed bottom-0 left-0 right-0 border-t border-[#e5e7eb] bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const t = input.trim();
            if (!t) return;
            setInput("");
            void sendAgentMessage(t);
          }}
        >
          <div className="mx-auto flex max-w-lg gap-2">
            {isVoiceSearchSupported() && (
              <button
                type="button"
                onClick={handleVoice}
                disabled={busy}
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#d1d5db] text-[#6b7280] disabled:opacity-40 ${
                  recording ? "animate-pulse border-[#1167b1] text-[#1167b1]" : ""
                }`}
                aria-label={recording ? "Sustabdyti balso įrašymą" : "Balso įvedimas"}
              >
                <Mic className="h-4 w-4" fill={recording ? "currentColor" : "none"} />
              </button>
            )}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pvz. Ieškau šeimyninio auto iki 7000€ Kaune"
              className="min-w-0 flex-1 rounded-xl border border-[#d1d5db] px-4 py-3 text-sm outline-none focus:border-[#1167b1]"
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1167b1] text-white disabled:opacity-40"
              aria-label="Siųsti"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function VautoAgentFab() {
  const { open, setOpen } = useVautoAgent();

  if (open) return null;

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="fixed bottom-24 right-4 z-[200] flex h-14 w-14 items-center justify-center rounded-full bg-[#1167b1] text-white shadow-lg shadow-[#1167b1]/30 hover:bg-[#0d5a9a]"
      aria-label="Atidaryti VAUTO asistentą"
      data-testid="vauto-agent-fab"
    >
      <Sparkles className="h-6 w-6" />
    </button>
  );
}
