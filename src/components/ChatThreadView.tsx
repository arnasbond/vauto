"use client";

import { ArrowLeft, Send } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useEffect } from "react";
import { EscrowActionBlock } from "@/components/EscrowActionBlock";
import { ReportButton } from "@/components/support/ReportButton";
import { useVauto } from "@/context/VautoContext";
import { getQuickQuestions } from "@/lib/chat-helpers";

function ChatThreadContent({ chatId }: { chatId: string }) {
  const { chats, sendMessage, user, listings, setActiveChatId } = useVauto();
  const [draft, setDraft] = useState("");
  const chat = chats.find((c) => c.id === chatId);
  const listing = listings.find((l) => l.id === chat?.listingId);
  const quickQuestions = getQuickQuestions(listing);
  const chatPreview = chat?.messages[chat.messages.length - 1]?.text;
  const reportedUserId =
    chat && chat.buyerId === user.id ? chat.sellerId : chat?.buyerId;

  useEffect(() => {
    setActiveChatId(chatId);
    return () => setActiveChatId(null);
  }, [chatId, setActiveChatId]);

  if (!chatId || !chat) {
    return (
      <p className="py-12 text-center text-[var(--vauto-text-muted)]">
        Pokalbis nerastas.
      </p>
    );
  }

  const handleSend = () => {
    if (!draft.trim()) return;
    sendMessage(chatId, draft.trim());
    setDraft("");
  };

  return (
    <div className="flex h-[calc(100dvh-2rem)] flex-col bg-white">
      <div className="mb-4 flex items-center gap-3 border-b border-gray-100 pb-3">
        <Link
          href="/chats"
          className="rounded-full p-2 text-[var(--vauto-text-muted)] hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="font-semibold text-[var(--vauto-text)]">
            {chat.listingTitle}
          </h1>
          <p className="text-xs text-[var(--vauto-text-muted)]">Pardavėjas</p>
        </div>
        <ReportButton
          variant="icon"
          listingId={chat.listingId}
          listingTitle={chat.listingTitle}
          chatId={chat.id}
          reportedUserId={reportedUserId}
          chatPreview={chatPreview}
        />
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {chat.messages.map((msg) => {
          const isMe = msg.senderId === user.id;
          return (
            <div
              key={msg.id}
              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  isMe
                    ? "rounded-br-md bg-[var(--vauto-blue)] text-white"
                    : "rounded-bl-md bg-gray-100 text-[var(--vauto-text)]"
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}

        {chat.escrowOffered && (
          <EscrowActionBlock chat={chat} amount={listing?.price ?? 150} />
        )}
      </div>

      {chat.messages.length <= 2 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {quickQuestions.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => sendMessage(chatId, q)}
              className="rounded-full bg-[var(--vauto-blue)]/10 px-3 py-1.5 text-xs font-medium text-[var(--vauto-blue)]"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 border-t border-gray-100 pt-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder='Parašykite... (bandykite "perku" arba "tinka")'
          className="flex-1 rounded-xl bg-gray-100 px-4 py-3 text-sm text-[var(--vauto-text)] outline-none focus:ring-2 focus:ring-[var(--vauto-blue)]/30"
        />
        <button
          type="button"
          onClick={handleSend}
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--vauto-orange)] text-white transition hover:bg-[var(--vauto-orange-light)]"
          aria-label="Siųsti"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export function ChatThreadView({ chatId }: { chatId: string }) {
  return <ChatThreadContent chatId={chatId} />;
}

export function ChatThreadFromQuery() {
  const searchParams = useSearchParams();
  const chatId = searchParams.get("id") ?? "";
  return <ChatThreadContent chatId={chatId} />;
}
