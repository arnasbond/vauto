"use client";

import { Check, CheckCheck } from "lucide-react";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/cn";

interface MessageStatusTicksProps {
  message: ChatMessage;
  isOwn: boolean;
}

export function MessageStatusTicks({ message, isOwn }: MessageStatusTicksProps) {
  if (!isOwn || message.senderId === "vauto-system") return null;

  const status = message.status ?? (message.readAt ? "read" : message.deliveredAt ? "delivered" : "sent");
  const isRead = status === "read";
  const isDelivered = status === "delivered" || isRead;

  return (
    <span
      className={cn(
        "ml-1.5 inline-flex items-center align-middle",
        isRead ? "text-sky-300" : "text-white/55"
      )}
      aria-label={
        isRead ? "Perskaityta" : isDelivered ? "Pristatyta" : "Išsiųsta"
      }
    >
      {isDelivered ? (
        <CheckCheck className="h-3.5 w-3.5" strokeWidth={2.5} />
      ) : (
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
      )}
    </span>
  );
}
