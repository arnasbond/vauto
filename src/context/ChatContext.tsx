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
import { requestChatShieldAnalysis } from "@/lib/chat-shield-client";
import { requestNegotiationTwin } from "@/lib/chat-agent-client";
import {
  canRunAutoNegotiation,
  resolveTwinMinPrice,
} from "@/lib/bargain-twin";
import { resolveSellerDisplayName } from "@/lib/user-trust-score";
import { logAnalytics } from "@/lib/analytics";
import { listingPath } from "@/lib/seo";
import {
  applyViewerReadState,
  markIncomingRead,
  markSenderMessagesRead,
  mergeThreadUpdate,
  patchMessageStatus,
  publishChatEvent,
  subscribeChatEvents,
} from "@/lib/chat-realtime";
import {
  buildChatPushPayload,
  dispatchChatPushNotification,
  requestChatPushPermission,
} from "@/lib/chat-push";
import type { ChatMessage, ChatThread, EscrowTransaction, Listing, NegotiationTwinConfig } from "@/lib/types";

interface ChatContextValue {
  chats: ChatThread[];
  sendMessage: (chatId: string, text: string) => void;
  startChat: (listingId: string) => string | null;
  updateEscrow: (chatId: string, escrow: EscrowTransaction) => void;
  updateNegotiationTwin: (chatId: string, config: NegotiationTwinConfig) => void;
  setActiveChatId: (chatId: string | null) => void;
  markChatRead: (chatId: string) => void;
  findListing: (idOrSlug: string) => Listing | undefined;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const DELIVER_MS = 420;
const READ_SIM_MS = 2400;

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
  const timeoutRef = useRef<Set<number>>(new Set());
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const userRef = useRef(user);
  userRef.current = user;
  const listingsRef = useRef(listings);
  listingsRef.current = listings;

  const scheduleTimeout = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timeoutRef.current.delete(id);
      fn();
    }, ms);
    timeoutRef.current.add(id);
    return id;
  }, []);

  const persistChat = useCallback(
    (thread: ChatThread) => {
      if (isDataApiEnabled()) {
        void apiUpsertChat(thread, user.id).then((r) => {
          if (!r.ok) setSyncError(`Pokalbio būsena neišsaugota: ${r.error}`);
        });
      }
    },
    [user.id, setSyncError]
  );

  const upsertChats = useCallback(
    (updater: (prev: ChatThread[]) => ChatThread[]) => {
      setChats((prev) => {
        const next = updater(prev);
        const changed = next.find(
          (t, i) => t !== prev[i] || t.messages.length !== prev[i]?.messages.length
        );
        if (changed) publishChatEvent({ type: "CHAT_UPSERT", thread: changed });
        return next;
      });
    },
    []
  );

  useEffect(() => {
    if (!hydrated) return;
    async function load() {
      if (apiActive && user.id && user.id !== "guest") {
        const res = await apiFetchChats(user.id);
        if (res.ok) setChats(res.data);
      } else {
        const stored = loadChats();
        if (stored?.length) {
          const mine =
            user.id && user.id !== "guest"
              ? stored.filter(
                  (c) => c.buyerId === user.id || c.sellerId === user.id
                )
              : stored;
          if (mine.length) setChats(mine);
        }
      }
      if (isAuthenticated && user.id !== "guest") {
        void requestChatPushPermission();
      }
    }
    void load();
  }, [hydrated, apiActive, user.id, isAuthenticated]);

  useEffect(() => {
    if (!hydrated || apiActive) return;
    saveChats(chats);
  }, [chats, hydrated, apiActive]);

  useEffect(() => {
    const timeouts = timeoutRef.current;
    const smsCancels = smsCancelRef.current;
    return () => {
      timeouts.forEach((id) => window.clearTimeout(id));
      timeouts.clear();
      smsCancels.forEach((cancel) => cancel());
      smsCancels.clear();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reload = () => {
      const stored = loadChats();
      if (!stored?.length) return;
      const uid = userRef.current.id;
      const mine =
        uid && uid !== "guest"
          ? stored.filter((c) => c.buyerId === uid || c.sellerId === uid)
          : stored;
      if (mine.length) setChats(mine);
    };
    window.addEventListener("vauto-chats-reload", reload);
    return () => window.removeEventListener("vauto-chats-reload", reload);
  }, []);

  useEffect(() => {
    return subscribeChatEvents((event) => {
      if (event.type === "CHAT_UPSERT") {
        setChats((prev) => mergeThreadUpdate(prev, event.thread));
      }
      if (event.type === "MESSAGE_STATUS") {
        setChats((prev) =>
          patchMessageStatus(prev, event.chatId, event.messageId, event.status ?? "sent")
        );
      }
      if (event.type === "CHAT_READ") {
        if (event.viewerId === userRef.current.id) {
          setChats((prev) => markIncomingRead(prev, event.chatId, event.viewerId));
        } else {
          setChats((prev) =>
            markSenderMessagesRead(prev, event.chatId, event.viewerId)
          );
        }
      }
    });
  }, []);

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
          upsertChats((prev) =>
            prev.map((c) =>
              c.id === chatId ? { ...c, smsFallbackSentFor: messageId } : c
            )
          );
          showToast(`📱 SMS: ${text}`, "info");
        }
      );
      smsCancelRef.current.set(chatId, cancel);
    },
    [showToast, upsertChats]
  );

  const advanceMessageStatus = useCallback(
    (chatId: string, messageId: string, senderId: string, recipientId: string) => {
      scheduleTimeout(() => {
        upsertChats((prev) => {
          const next = patchMessageStatus(prev, chatId, messageId, "delivered");
          publishChatEvent({
            type: "MESSAGE_STATUS",
            chatId,
            messageId,
            status: "delivered",
          });
          const thread = next.find((c) => c.id === chatId);
          if (thread) persistChat(thread);
          return next;
        });
      }, DELIVER_MS);

      scheduleTimeout(() => {
        if (activeChatIdRef.current === chatId) {
          upsertChats((prev) => {
            const next = markSenderMessagesRead(prev, chatId, senderId);
            publishChatEvent({
              type: "CHAT_READ",
              chatId,
              viewerId: recipientId,
              at: new Date().toISOString(),
            });
            const thread = next.find((c) => c.id === chatId);
            if (thread) persistChat(thread);
            return next;
          });
        }
      }, READ_SIM_MS);
    },
    [persistChat, scheduleTimeout, upsertChats]
  );

  const notifyRecipient = useCallback(
    (chat: ChatThread, message: ChatMessage, recipientId: string) => {
      if (activeChatIdRef.current === chat.id) return;
      if (message.senderId === recipientId) return;
      if (userRef.current.id !== recipientId) return;

      const listing = listingsRef.current.find((l) => l.id === chat.listingId);
      const sender =
        message.senderId === chat.buyerId
          ? { name: userRef.current.name, companyName: userRef.current.companyName }
          : {
              name: listing?.title ? "Pardavėjas" : "VAUTO",
              companyName: undefined,
            };

      const payload = buildChatPushPayload({
        chat,
        listing,
        sender,
        messageText: message.text,
      });
      void dispatchChatPushNotification(payload);
    },
    []
  );

  const markChatRead = useCallback(
    (chatId: string) => {
      const now = new Date().toISOString();
      smsCancelRef.current.get(chatId)?.();
      smsCancelRef.current.delete(chatId);

      upsertChats((prev) => {
        const next = applyViewerReadState(prev, chatId, user.id);
        publishChatEvent({ type: "CHAT_READ", chatId, viewerId: user.id, at: now });
        const thread = next.find((c) => c.id === chatId);
        if (thread) persistChat(thread);
        return next;
      });
    },
    [user.id, persistChat, upsertChats]
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
      if (!isAuthenticated || user.id === "guest") {
        openAuthModal("/pokalbiai");
        return;
      }

      const msg: ChatMessage = {
        id: `m-${Date.now()}`,
        senderId: user.id,
        text,
        timestamp: new Date().toISOString(),
        status: "sent",
      };

      let buyerId = "";
      let sellerId = "";
      let listingTitle = "";
      let updatedThread: ChatThread | null = null;

      upsertChats((prev) =>
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
          updatedThread = updated;
          return updated;
        })
      );

      if (updatedThread) {
        const thread = updatedThread;
        persistChat(thread);
        const recipientId = user.id === buyerId ? sellerId : buyerId;
        if (recipientId) {
          advanceMessageStatus(chatId, msg.id, user.id, recipientId);
          notifyRecipient(thread, msg, recipientId);
        }

        if (user.id === buyerId && sellerId) {
          const chatMeta = chatsRef.current.find((c) => c.id === chatId);
          const listing = chatMeta
            ? listingsRef.current.find((l) => l.id === chatMeta.listingId)
            : undefined;
          const sellerName = resolveSellerDisplayName(sellerId, listingsRef.current);
          const twin = chatMeta?.negotiationTwin;

          if (canRunAutoNegotiation(twin, listing?.minNegotiationPrice) && listing) {
            const minPrice = resolveTwinMinPrice(twin, listing);
            void requestNegotiationTwin({
              buyerMessage: text,
              listingPrice: listing.price,
              minPrice,
              listingTitle: listing.title,
              sellerName,
              sellerUserId: sellerId,
              sellerApproved: twin?.sellerApproved !== false,
              autoNegotiationEnabled: twin?.enabled ?? false,
            }).then((negotiation) => {
              if (!negotiation?.shouldReply || !negotiation.autoReply?.trim()) return;

              const autoId = `m-twin-${Date.now()}`;
              const autoMsg: ChatMessage = {
                id: autoId,
                senderId: sellerId,
                text: negotiation.autoReply,
                timestamp: new Date().toISOString(),
                status: "sent",
              };

              upsertChats((prev) =>
                prev.map((c) => {
                  if (c.id !== chatId) return c;
                  return {
                    ...c,
                    messages: [...c.messages, autoMsg],
                    ...(negotiation.dealReady ? { escrowOffered: true } : {}),
                  };
                })
              );

              if (userRef.current.id === sellerId && negotiation.sellerNotification) {
                showToast(`🤖 ${negotiation.sellerNotification}`, "success");
              }
            });
          } else {
            void requestChatShieldAnalysis({
              message: text,
              listingPrice: listing?.price ?? 0,
              listingTitle: listing?.title ?? listingTitle,
              sellerName,
            }).then((shield) => {
              if (!shield?.shouldShield || !shield.autoReply?.trim()) return;

              const autoId = `m-shield-${Date.now()}`;
              const autoMsg: ChatMessage = {
                id: autoId,
                senderId: sellerId,
                text: shield.autoReply,
                timestamp: new Date().toISOString(),
                status: "sent",
              };

              upsertChats((prev) =>
                prev.map((c) =>
                  c.id === chatId ? { ...c, messages: [...c.messages, autoMsg] } : c
                )
              );

              if (userRef.current.id === sellerId && shield.sellerNotification) {
                showToast(`🛡️ ${shield.sellerNotification}`, "info");
              }
            });
          }
        }
      }

      scheduleTimeout(() => {
        if (user.id !== buyerId) return;
        const replyId = `m-${Date.now()}`;
        const reply: ChatMessage = {
          id: replyId,
          senderId: "vauto-system",
          text: "Žinutė išsiųsta pardavėjui. Atsakymą matysite šiame pokalbyje.",
          timestamp: new Date().toISOString(),
        };
        upsertChats((prev) =>
          prev.map((c) =>
            c.id === chatId ? { ...c, messages: [...c.messages, reply] } : c
          )
        );
        if (sellerId) scheduleIncomingSms(chatId, replyId, sellerId, listingTitle);
      }, 1500);
    },
    [
      user.id,
      isAuthenticated,
      openAuthModal,
      showToast,
      scheduleIncomingSms,
      persistChat,
      upsertChats,
      advanceMessageStatus,
      notifyRecipient,
      scheduleTimeout,
    ]
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
            status: "sent",
          },
        ],
        escrowOffered: false,
      };
      setChats((prev) => [newChat, ...prev]);
      publishChatEvent({ type: "CHAT_UPSERT", thread: newChat });
      bumpListingById(listingId, "chatStarts");
      logAnalytics("listing_chat_start", {
        listingId,
        title: listing.title,
        sellerId: listing.sellerId,
      });
      persistChat(newChat);
      return chatId;
    },
    [
      listings,
      chats,
      user.id,
      isAuthenticated,
      openAuthModal,
      bumpListingById,
      persistChat,
    ]
  );

  const updateEscrow = useCallback(
    (chatId: string, escrow: EscrowTransaction) => {
      upsertChats((prev) =>
        prev.map((chat) => (chat.id === chatId ? { ...chat, escrow } : chat))
      );
      if (isDataApiEnabled()) {
        void apiUpsertEscrow(escrow).then((r) => {
          if (!r.ok) setSyncError(`Escrow neišsaugotas: ${r.error}`);
        });
      }
    },
    [setSyncError, upsertChats]
  );

  const updateNegotiationTwin = useCallback(
    (chatId: string, config: NegotiationTwinConfig) => {
      let saved: ChatThread | null = null;
      upsertChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== chatId) return chat;
          saved = { ...chat, negotiationTwin: config };
          return saved;
        })
      );
      if (saved) persistChat(saved);
    },
    [persistChat, upsertChats]
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      chats,
      sendMessage,
      startChat,
      updateEscrow,
      updateNegotiationTwin,
      setActiveChatId,
      markChatRead,
      findListing,
    }),
    [
      chats,
      sendMessage,
      startChat,
      updateEscrow,
      updateNegotiationTwin,
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
