"use client";

import { useState } from "react";
import { Languages, Loader2 } from "lucide-react";
import { apiTranslateChatMessage } from "@/lib/api/chat-translate";

interface ChatTranslateButtonProps {
  text: string;
  isOwn: boolean;
  onTranslated: (translated: string) => void;
}

export function ChatTranslateButton({
  text,
  isOwn,
  onTranslated,
}: ChatTranslateButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!text.trim() || text.trim().length < 2) return null;

  const handleTranslate = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await apiTranslateChatMessage(text, "lt");
    setBusy(false);
    if (!res.ok) {
      setError("Nepavyko išversti");
      return;
    }
    if (res.data.isAlreadyTarget) {
      onTranslated(res.data.translated);
      return;
    }
    onTranslated(res.data.translated);
  };

  return (
    <div className="mt-1.5 flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={() => void handleTranslate()}
        disabled={busy}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition disabled:opacity-60 ${
          isOwn
            ? "bg-white/15 text-white hover:bg-white/25"
            : "bg-[var(--vauto-teal)]/10 text-[var(--vauto-teal)] hover:bg-[var(--vauto-teal)]/15"
        }`}
        aria-label="Išversti žinutę"
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : (
          <Languages className="h-3 w-3" aria-hidden />
        )}
        {busy ? "Verčiama…" : "🌐 Išversti"}
      </button>
      {error ? (
        <span className="text-[10px] opacity-80">{error}</span>
      ) : null}
    </div>
  );
}
