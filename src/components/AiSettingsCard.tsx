"use client";

import { useEffect, useState } from "react";
import { KeyRound, Sparkles, Trash2 } from "lucide-react";
import {
  clearOpenAiKey,
  getOpenAiKey,
  hasOpenAiKey,
  setOpenAiKey,
} from "@/lib/openai-settings";
import { clearAllData } from "@/lib/storage";

export function AiSettingsCard() {
  const [input, setInput] = useState("");
  const [stored, setStored] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setStored(hasOpenAiKey());
  }, []);

  const handleSave = () => {
    if (!input.startsWith("sk-") || input.length < 20) {
      alert("Įveskite galiojantį OpenAI raktą (prasideda sk-)");
      return;
    }
    setOpenAiKey(input);
    setStored(true);
    setInput("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClearKey = () => {
    clearOpenAiKey();
    setStored(false);
    setInput("");
  };

  const handleClearData = () => {
    if (confirm("Ištrinti visus išsaugotus skelbimus ir pokalbius?")) {
      clearAllData();
      window.location.reload();
    }
  };

  const masked = stored ? getOpenAiKey()?.slice(0, 7) + "••••••••" : null;

  return (
    <div className="card-shadow mt-6 rounded-2xl bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-[var(--vauto-orange)]" />
        <h2 className="font-semibold text-[var(--vauto-text)]">AI nustatymai</h2>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${
            stored
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {stored ? "GPT-4o + Whisper" : "Demo režimas"}
        </span>
      </div>

      {masked && (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-[var(--vauto-text-muted)]">
          <KeyRound className="h-3.5 w-3.5" />
          Aktyvus: {masked}
        </p>
      )}

      <input
        type="password"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={stored ? "Įveskite naują raktą..." : "sk-..."}
        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[var(--vauto-blue)] focus:ring-2 focus:ring-[var(--vauto-blue)]/20"
      />

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 rounded-xl bg-[var(--vauto-blue)] py-2.5 text-sm font-medium text-white"
        >
          {saved ? "Išsaugota!" : "Išsaugoti raktą"}
        </button>
        {stored && (
          <button
            type="button"
            onClick={handleClearKey}
            className="flex items-center justify-center rounded-xl border border-gray-200 px-3 text-[var(--vauto-text-muted)]"
            aria-label="Pašalinti raktą"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={handleClearData}
        className="mt-4 w-full rounded-xl border border-red-200 py-2 text-xs text-red-500"
      >
        Išvalyti visus duomenis
      </button>
    </div>
  );
}
