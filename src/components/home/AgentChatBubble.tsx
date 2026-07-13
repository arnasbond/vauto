"use client";

import { cn } from "@/lib/cn";

export function AgentChatBubble({
  role,
  children,
  className,
}: {
  role: "user" | "assistant";
  children: React.ReactNode;
  className?: string;
}) {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start",
        className
      )}
    >
      <div
        className={cn(
          "agent-chat-bubble max-w-[min(100%,18.5rem)] break-words rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed [overflow-wrap:anywhere] md:max-w-[min(100%,36rem)] md:text-[14px] lg:max-w-[min(100%,42rem)]",
          isUser
            ? "agent-chat-bubble-user rounded-br-md"
            : "agent-chat-bubble-assistant rounded-bl-md"
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function AgentQuickReplyChips({
  options,
  disabled,
  onSelect,
  embedded,
}: {
  options: string[];
  disabled?: boolean;
  onSelect: (option: string) => void;
  /** Render inside assistant bubble — tighter layout for mobile */
  embedded?: boolean;
}) {
  if (!options.length) return null;

  return (
    <div
      className={cn(
        "agent-quick-reply-chips flex flex-wrap gap-1.5",
        embedded ? "mt-2.5 w-full" : "mt-2 gap-2"
      )}
      role="group"
      aria-label="Greiti atsakymai"
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(option)}
          className={cn(
            "agent-quick-reply-chip touch-manipulation rounded-full border text-left font-medium leading-snug transition active:scale-[0.98] disabled:opacity-50",
            embedded
              ? "min-h-[36px] max-w-full px-2.5 py-1.5 text-[11px] [overflow-wrap:anywhere]"
              : "min-h-[40px] px-3 py-2 text-[12px]"
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
