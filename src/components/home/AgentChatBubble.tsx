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
          "agent-chat-bubble max-w-[min(100%,20rem)] break-words rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed [overflow-wrap:anywhere]",
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
}: {
  options: string[];
  disabled?: boolean;
  onSelect: (option: string) => void;
}) {
  if (!options.length) return null;

  return (
    <div
      className="agent-quick-reply-chips mt-2 flex flex-wrap gap-2"
      role="group"
      aria-label="Greiti atsakymai"
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(option)}
          className="agent-quick-reply-chip min-h-[40px] touch-manipulation rounded-full border px-3 py-2 text-left text-[12px] font-medium leading-snug transition active:scale-[0.98] disabled:opacity-50"
        >
          {option}
        </button>
      ))}
    </div>
  );
}
