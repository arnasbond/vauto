"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { useVauto } from "@/context/VautoContext";
import { sanitizeAgentReplyForDisplay } from "@/lib/agent-reply-display";
import { looksLikeClothingListing } from "@/lib/clothing-catalog";
import { pushAddListing } from "@/lib/listing-navigation";
import { detectSellerListingIntent } from "@/lib/scoring";

/**
 * Organiškas AI dialogas namų ekrane — 2 paskutinės eilutės + veikiantys CTA mygtukai.
 */
export function AgentChatStrip() {
  const router = useRouter();
  const { messages, busy } = useVautoAgent();
  const { startListingFromQuery } = useVauto();
  const recent = messages.slice(-2);

  const lastUser = useMemo(
    () => [...messages].reverse().find((m) => m.role === "user")?.text ?? "",
    [messages]
  );

  const sellCta = useMemo(() => {
    if (busy) return null;
    const userWantsSell = detectSellerListingIntent(lastUser);
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant")?.text;
    const assistantSuggestsSell =
      typeof lastAssistant === "string" &&
      /\b(parduot|skelb|įkelt|ikelt|spint|pradėkime|pradekime|kelkime|formą|forma)\w*/i.test(
        lastAssistant
      );
    if (!userWantsSell && !assistantSuggestsSell) return null;
    const fashion = looksLikeClothingListing(`${lastUser} ${lastAssistant ?? ""}`);
    return {
      fashion,
      label: fashion ? "Atidaryti Spintos įkėlimą" : "Atidaryti skelbimo formą",
    };
  }, [busy, lastUser, messages]);

  const handleSellCta = () => {
    pushAddListing(router, sellCta?.fashion);
    if (lastUser.trim()) startListingFromQuery(lastUser);
  };

  if (!recent.length && !busy) return null;

  return (
    <div
      className="relative z-20 mt-3 rounded-2xl border border-[var(--vauto-primary)]/15 bg-[var(--vauto-card-bg)] px-3.5 py-3 shadow-sm"
      aria-live="polite"
      aria-label="VAUTO asistento atsakymas"
    >
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--vauto-primary)]">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        VAUTO asistentas
      </div>
      <div className="space-y-2">
        {recent.map((m, i) => (
          <p
            key={`${m.role}-${i}-${m.text.slice(0, 24)}`}
            className={
              m.role === "user"
                ? "text-right text-[13px] leading-snug text-[var(--vauto-text-muted)]"
                : "text-[13px] leading-relaxed text-[var(--vauto-text-main)]"
            }
          >
            {m.role === "user" ? (
              <>
                <span className="text-[10px] font-medium text-[var(--vauto-text-muted)]">
                  Jūs:{" "}
                </span>
                {m.text}
              </>
            ) : (
              sanitizeAgentReplyForDisplay(m.text) || m.text
            )}
          </p>
        ))}
        {busy && (
          <p className="flex items-center gap-2 text-[12px] text-[var(--vauto-text-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Galvoju…
          </p>
        )}
      </div>

      {sellCta && (
        <button
          type="button"
          onClick={handleSellCta}
          className="relative z-30 mt-3 flex w-full touch-manipulation items-center justify-center gap-2 rounded-xl bg-[var(--vauto-primary)] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 active:scale-[0.99]"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          {sellCta.label}
        </button>
      )}
    </div>
  );
}
