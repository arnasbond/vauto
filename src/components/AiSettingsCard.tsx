"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Sparkles, Trash2, Zap } from "lucide-react";
import { apiAiHealthCheck, apiExtractText } from "@/lib/api/client";
import {
  clearOpenAiKey,
  getOpenAiKey,
  hasOpenAiKey,
  setOpenAiKey,
} from "@/lib/openai-settings";
import { clearAllData } from "@/lib/storage";

type AiMode = "checking" | "server" | "personal" | "demo";

export function AiSettingsCard() {
  const [input, setInput] = useState("");
  const [personalKey, setPersonalKey] = useState(false);
  const [mode, setMode] = useState<AiMode>("checking");
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setMode("checking");
    const health = await apiAiHealthCheck();
    if (health?.openai) {
      setMode("server");
      return;
    }
    if (hasOpenAiKey()) {
      setMode("personal");
      return;
    }
    setMode("demo");
  }, []);

  useEffect(() => {
    setPersonalKey(hasOpenAiKey());
    void refreshStatus();
  }, [refreshStatus]);

  const handleSave = () => {
    if (!input.startsWith("sk-") || input.length < 20) {
      alert("Įveskite galiojantį OpenAI raktą (prasideda sk-)");
      return;
    }
    setOpenAiKey(input);
    setPersonalKey(true);
    setInput("");
    setSaved(true);
    setMode("personal");
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClearKey = () => {
    clearOpenAiKey();
    setPersonalKey(false);
    setInput("");
    void refreshStatus();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiExtractText({
        text: "Parduodu iPhone 13, 320 eurų, puiki būklė, Vilnius",
        userCity: "Vilnius",
        contact: "+370 600 00000",
      });
      if (result?.title) {
        setTestResult(`✓ AI veikia: „${result.title}" — ${result.price}€`);
        if (mode === "demo") setMode("server");
      } else if (hasOpenAiKey()) {
        setTestResult("✓ Asmeninis raktas išsaugotas (serverio AI nepasiekiamas)");
      } else {
        setTestResult("✗ Demo režimas — serverio AI raktas dar nesukonfigūruotas");
      }
    } catch {
      setTestResult("✗ Testas nepavyko — patikrinkite raktą");
    } finally {
      setTesting(false);
    }
  };

  const handleClearData = () => {
    if (confirm("Ištrinti visus išsaugotus skelbimus ir pokalbius?")) {
      clearAllData();
      window.location.reload();
    }
  };

  const masked = personalKey ? getOpenAiKey()?.slice(0, 7) + "••••••••" : null;

  const badge =
    mode === "checking"
      ? { label: "Tikrinama…", className: "bg-gray-100 text-gray-500" }
      : mode === "server"
        ? { label: "Serverio AI", className: "bg-green-100 text-green-700" }
        : mode === "personal"
          ? { label: "Asmeninis raktas", className: "bg-blue-100 text-blue-700" }
          : { label: "Demo režimas", className: "bg-amber-100 text-amber-700" };

  return (
    <div className="card-shadow mt-6 rounded-2xl bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-[var(--vauto-orange)]" />
        <h2 className="font-semibold text-[var(--vauto-text)]">AI nustatymai</h2>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      {mode === "server" && (
        <p className="mb-3 rounded-xl bg-green-50 px-3 py-2 text-xs text-green-800">
          AI veikia per Vauto serverį — nereikia įvesti savo rakto. Tinka visiems
          testuotojams.
        </p>
      )}

      {mode === "demo" && (
        <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Dabar naudojami demo duomenys. Serverio AI raktas dar neįdiegtas Vercel
          aplinkoje.
        </p>
      )}

      {masked && (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-[var(--vauto-text-muted)]">
          <KeyRound className="h-3.5 w-3.5" />
          Asmeninis raktas: {masked}
        </p>
      )}

      <button
        type="button"
        onClick={handleTest}
        disabled={testing}
        className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--vauto-blue)]/30 bg-[var(--vauto-blue)]/5 py-2.5 text-sm font-medium text-[var(--vauto-blue)] disabled:opacity-60"
      >
        {testing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Zap className="h-4 w-4" />
        )}
        {testing ? "Testuojama…" : "Testuoti AI"}
      </button>

      {testResult && (
        <p className="mb-3 text-xs text-[var(--vauto-text-muted)]">{testResult}</p>
      )}

      <details className="group">
        <summary className="cursor-pointer text-xs font-medium text-[var(--vauto-text-muted)]">
          Naudoti savo OpenAI raktą (nebūtina)
        </summary>
        <div className="mt-3">
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={personalKey ? "Įveskite naują raktą..." : "sk-..."}
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
            {personalKey && (
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
        </div>
      </details>

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
