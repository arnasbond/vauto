"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Loader2, MessageCircle, X } from "lucide-react";
import type { Listing } from "@/lib/types";
import type { ProfileType } from "@/lib/profile-type";
import { requestNegotiationTwin } from "@/lib/chat-agent-client";
import { blockNativeClickThrough } from "@/lib/native-click-guard";

const SANDBOX_BUYER_ID = "pirkėjas-99";
const SANDBOX_BUYER_NAME = "Pirkėjas_99";
const AI_TWIN_LABEL = "AI Dvynys";

interface SandboxMessage {
  id: string;
  senderId: string;
  senderLabel: string;
  text: string;
  isAi?: boolean;
}

interface NegotiationSandboxModalProps {
  open: boolean;
  onClose: () => void;
  listing: Listing;
  sellerName: string;
  sellerUserId?: string;
  profileType?: ProfileType;
}

function buildAggressiveBuyerMessages(listing: Listing): string[] {
  const price = Math.max(1, listing.price);
  const lowball = Math.max(1, Math.round(price * 0.22));
  const pushy = Math.max(lowball + 1, Math.round(price * 0.42));
  return [
    `Labas! Duodu ${lowball}€ už „${listing.title}"? Reikia šiandien — greitai atsiimsiu, grynais! 💸`,
    `Na gerai… max ${pushy}€ — daugiau tikrai nemoku. Kitas pasiūlys mažiau, žinok 🙄`,
  ];
}

function minNegotiationPrice(listing: Listing): number {
  const floor = listing.minNegotiationPrice;
  if (floor && floor > 0) return floor;
  return Math.max(1, Math.round(listing.price * 0.75));
}

export function NegotiationSandboxModal({
  open,
  onClose,
  listing,
  sellerName,
  sellerUserId,
  profileType,
}: NegotiationSandboxModalProps) {
  const [messages, setMessages] = useState<SandboxMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const appendMessage = useCallback((msg: Omit<SandboxMessage, "id">) => {
    setMessages((prev) => [
      ...prev,
      { ...msg, id: `sandbox-${prev.length}-${Date.now()}` },
    ]);
  }, []);

  const runSimulation = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setRunning(true);
    setMessages([]);
    setDone(false);

    const buyerLines = buildAggressiveBuyerMessages(listing);
    const minPrice = minNegotiationPrice(listing);

    appendMessage({
      senderId: "vauto-system",
      senderLabel: "VAUTO",
      text: `🎭 Derybų poligonas — stebėkite, kaip ${AI_TWIN_LABEL} gina jūsų kainą (${listing.price} €, min. ${minPrice} €).`,
    });

    await new Promise((r) => setTimeout(r, 900));

    for (let i = 0; i < buyerLines.length; i += 1) {
      const buyerText = buyerLines[i]!;
      appendMessage({
        senderId: SANDBOX_BUYER_ID,
        senderLabel: SANDBOX_BUYER_NAME,
        text: buyerText,
      });

      await new Promise((r) => setTimeout(r, 1200));

      const twin = await requestNegotiationTwin({
        buyerMessage: buyerText,
        listingPrice: listing.price,
        minPrice,
        listingTitle: listing.title,
        sellerName,
        sellerUserId,
        profileType,
        sellerApproved: true,
        autoNegotiationEnabled: true,
      });

      if (twin?.shouldReply && twin.autoReply) {
        appendMessage({
          senderId: "ai-twin",
          senderLabel: AI_TWIN_LABEL,
          text: twin.autoReply,
          isAi: true,
        });
      } else {
        appendMessage({
          senderId: "ai-twin",
          senderLabel: AI_TWIN_LABEL,
          text: `Atsiprašau, ${listing.price} € yra sąžininga rinkos kaina už „${listing.title}". Mažiau nei ${minPrice} € pardavėja negali sutikti.`,
          isAi: true,
        });
      }

      await new Promise((r) => setTimeout(r, 1400));
    }

    appendMessage({
      senderId: "vauto-system",
      senderLabel: "VAUTO",
      text: "✅ Simuliacija baigta — tikras pirkėjas gautų tokius pat protingus atsakymus automatiškai.",
    });

    setRunning(false);
    setDone(true);
  }, [appendMessage, listing, sellerName, sellerUserId, profileType]);

  useEffect(() => {
    if (!open) {
      startedRef.current = false;
      setMessages([]);
      setRunning(false);
      setDone(false);
      return;
    }
    void runSimulation();
  }, [open, runSimulation]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  if (!open) return null;

  const handleClose = () => {
    blockNativeClickThrough();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[250] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="negotiation-sandbox-title"
    >
      <div className="flex h-[min(88dvh,640px)] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-[#0f1629] shadow-2xl ring-1 ring-fuchsia-500/30">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <h2
              id="negotiation-sandbox-title"
              className="flex items-center gap-2 text-sm font-bold text-white"
            >
              <MessageCircle className="h-4 w-4 text-fuchsia-400" />
              Derybų AI poligonas
            </h2>
            <p className="truncate text-[11px] text-slate-400">{listing.title}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="Uždaryti"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((msg) => {
            const isBuyer = msg.senderId === SANDBOX_BUYER_ID;
            const isSystem = msg.senderId === "vauto-system";
            const isAi = msg.isAi;

            return (
              <div
                key={msg.id}
                className={`flex ${isBuyer || isSystem ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    isSystem
                      ? "border border-white/10 bg-white/5 text-xs italic text-slate-400"
                      : isBuyer
                        ? "rounded-bl-md border border-red-500/20 bg-red-950/40 text-red-100"
                        : isAi
                          ? "rounded-br-md border border-fuchsia-500/30 bg-fuchsia-950/50 text-fuchsia-50"
                          : "bg-[var(--vauto-teal)] text-white"
                  }`}
                >
                  {!isSystem && (
                    <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold opacity-70">
                      {isAi && <Bot className="h-3 w-3" />}
                      {msg.senderLabel}
                    </p>
                  )}
                  <p>{msg.text}</p>
                </div>
              </div>
            );
          })}

          {running && !done && (
            <div className="flex justify-end">
              <div className="flex items-center gap-2 rounded-2xl bg-fuchsia-900/30 px-3 py-2 text-xs text-fuchsia-200">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {AI_TWIN_LABEL} galvoja…
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-white/10 p-4">
          <button
            type="button"
            onClick={handleClose}
            className="w-full rounded-2xl bg-fuchsia-600 py-3 text-sm font-semibold text-white hover:bg-fuchsia-500"
          >
            {done ? "Uždaryti" : "Stabdyti demonstraciją"}
          </button>
        </div>
      </div>
    </div>
  );
}
