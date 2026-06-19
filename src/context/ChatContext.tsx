"use client";

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
import { INITIAL_CHATS } from "@/data/mockListings";
import { useAuth } from "@/context/AuthContext";
import { useVautoBridge } from "@/context/VautoBridge";
import { detectPurchaseIntent } from "@/lib/scoring";
import { apiFetchChats, apiUpsertChat, apiUpsertEscrow } from "@/lib/api/client";
import { isDataApiEnabled } from "@/lib/api/config";
import { loadChats, saveChats } from "@/lib/storage";
import { scheduleSmsFallback } from "@/lib/sms-fallback";
import { logAnalytics } from "@/lib/analytics";
import { listingPath } from "@/lib/seo";
import type { ChatMessage, ChatThread, EscrowTransaction, Listing } from "@/lib/types";

interface ChatContextValue {
  chats: ChatThread[];
  sendMessage: (chatId: string, text: string) => void;
  startChat: (listingId: string) => string | null;
  updateEscrow: (chatId: string, escrow: EscrowTransaction) => void;
  setActiveChatId: (chatId: string | null) => void;
  markChatRead: (chatId: string) => void;
  findListing: (idOrSlug: string) => Listing | undefined;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, openAuthModal } = useAuth();
  const {
    listings,
    bumpListingById,
    apiActive,
    hydrated,
    setSyncError,
    showToast,
  } = useVautoBridge();

  const [chats, setChats] = useState<ChatThread[]>(INITIAL_CHATS);
  const activeChatIdRef = useRef<string | null>(null);
  const smsCancelRef = useRef<Map<string, () => void>>(new Map());
  const chatsRef = useRef(chats);
  chatsRef.current = chats;

  useEffect(() => {
    if (!hydrated) return;
    async function load() {
      if (apiActive && user.id && user.id !== "guest") {
        const res = await apiFetchChats(user.id);
        if (res.ok) setChats(res.data);
      } else {
        const stored = loadChats();
        if (stored?.length) setChats(stored);
      }
    }
    void load();
  }, [hydrated, apiActive, user.id]);

  useEffect(() => {
    if (!hydrated || apiActive) return;
    saveChats(chats);
  }, [chats, hydrated, apiActive]);

  const scheduleIncomingSms = useCallback(
    (
      chatId: string,
      messageId: string,
      recipientId: string,
      listingTitle: string
    ) => {
      smsCancelRef.current.get(chatId)?.();
      const cancel = scheduleSmsFallback(
        { chatId, messageId, recipientId, listingTitle },
        () => {
          const chat = chatsRef.current.find((c) => c.id === chatId);
          if (!chat) return false;
          if (activeChatIdRef.current === chatId) return false;
          if (chat.smsFallbackSentFor === messageId) return false;
          const msg = chat.messages.find((m) => m.id === messageId);
          if (!msg || msg.readAt) return false;
          return msg.senderId !== recipientId;
        },
        (text) => {
          setChats((prev) =>
            prev.map((c) =>
              c.id === chatId ? { ...c, smsFallbackSentFor: messageId } : c
            )
          );
          showToast(`📱 SMS: ${text}`, "info");
        }
      );
      smsCancelRef.current.set(chatId, cancel);
    },
    [showToast]
  );

  const markChatRead = useCallback(
    (chatId: string) => {
      const now = new Date().toISOString();
      smsCancelRef.current.get(chatId)?.();
      smsCancelRef.current.delete(chatId);
      setChats((prev) => {
        const next = prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                lastReadAt: now,
                messages: c.messages.map((m) =>
                  m.readAt ? m : { ...m, readAt: now }
                ),
              }
            : c
        );
        if (isDataApiEnabled()) {
          const updated = next.find((c) => c.id === chatId);
          if (updated) {
            void apiUpsertChat(updated, user.id).then((r) => {
              if (!r.ok) setSyncError(`Pokalbio būsena neišsaugota: ${r.error}`);
            });
          }
        }
        return next;
      });
    },
    [user.id, setSyncError]
  );

  const setActiveChatId = useCallback(
    (chatId: string | null) => {
      activeChatIdRef.current = chatId;
      if (chatId) markChatRead(chatId);
    },
    [markChatRead]
  );

  const findListing = useCallback(
    (idOrSlug: string) =>
      listings.find((l) => l.id === idOrSlug || l.slug === idOrSlug),
    [listings]
  );

  const sendMessage = useCallback(
    (chatId: string, text: string) => {
      const msg: ChatMessage = {
        id: `m-${Date.now()}`,
        senderId: user.id,
        text,
        timestamp: new Date().toISOString(),
      };

      let buyerId = "";
      let sellerId = "";
      let listingTitle = "";

      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== chatId) return chat;
          buyerId = chat.buyerId;
          sellerId = chat.sellerId;
          listingTitle = chat.listingTitle;
          const updated: ChatThread = {
            ...chat,
            messages: [...chat.messages, msg],
          };
          if (!chat.escrowOffered && detectPurchaseIntent(text)) {
            updated.escrowOffered = true;
          }
          if (isDataApiEnabled()) {
            void apiUpsertChat(updated, user.id).then((r) => {
              if (!r.ok) setSyncError(`Žinutė neišsaugota: ${r.error}`);
            });
          }
          return updated;
        })
      );

      window.setTimeout(() => {
        if (user.id !== buyerId) return;
        const replyId = `m-${Date.now()}`;
        const reply: ChatMessage = {
          id: replyId,
          senderId: "vauto-system",
          text: "Žinutė išsiųsta pardavėjui. Atsakymą matysite šiame pokalbyje.",
          timestamp: new Date().toISOString(),
        };
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId ? { ...c, messages: [...c.messages, reply] } : c
          )
        );
        if (sellerId) scheduleIncomingSms(chatId, replyId, sellerId, listingTitle);
      }, 1500);
    },
    [user.id, scheduleIncomingSms, setSyncError]
  );

  const startChat = useCallback(
    (listingId: string): string | null => {
      const listing = listings.find((l) => l.id === listingId);
      if (!listing) return null;
      if (listing.sellerId === user.id) return null;
      if (!isAuthenticated) {
        openAuthModal(listingPath(listing));
        return null;
      }
      const existing = chats.find(
        (c) => c.listingId === listingId && c.buyerId === user.id
      );
      if (existing) return existing.id;

      const chatId = `chat-${Date.now()}`;
      const newChat: ChatThread = {
        id: chatId,
        listingId,
        listingTitle: listing.title,
        buyerId: user.id,
        sellerId: listing.sellerId,
        messages: [
          {
            id: `m-${Date.now()}`,
            senderId: user.id,
            text: `Labas! Dominu „${listing.title}".`,
            timestamp: new Date().toISOString(),
          },
        ],
        escrowOffered: false,
      };
      setChats((prev) => [newChat, ...prev]);
      bumpListingById(listingId, "chatStarts");
      logAnalytics("listing_chat_start", {
        listingId,
        title: listing.title,
        sellerId: listing.sellerId,
      });
      if (isDataApiEnabled()) {
        void apiUpsertChat(newChat, user.id).then((r) => {
          if (!r.ok) setSyncError(`Pokalbis neišsaugotas: ${r.error}`);
        });
      }
      return chatId;
    },
    [
      listings,
      chats,
      user.id,
      isAuthenticated,
      openAuthModal,
      bumpListingById,
      setSyncError,
    ]
  );

  const updateEscrow = useCallback(
    (chatId: string, escrow: EscrowTransaction) => {
      setChats((prev) =>
        prev.map((chat) => (chat.id === chatId ? { ...chat, escrow } : chat))
      );
      if (isDataApiEnabled()) {
        void apiUpsertEscrow(escrow).then((r) => {
          if (!r.ok) setSyncError(`Escrow neišsaugotas: ${r.error}`);
        });
      }
    },
    [setSyncError]
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      chats,
      sendMessage,
      startChat,
      updateEscrow,
      setActiveChatId,
      markChatRead,
      findListing,
    }),
    [
      chats,
      sendMessage,
      startChat,
      updateEscrow,
      setActiveChatId,
      markChatRead,
      findListing,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
