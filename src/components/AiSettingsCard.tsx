"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Save, Sparkles, Trash2, Zap } from "lucide-react";
import { apiAiHealthCheck, apiExtractText } from "@/lib/api/client";
import {
  clearOpenAiKey,
  getOpenAiKey,
  hasOpenAiKey,
  setOpenAiKey,
} from "@/lib/openai-settings";
import { clearAllData } from "@/lib/storage";
import { useAdminProjectContext } from "@/context/AdminProjectContext";
import { MAX_ADMIN_PROJECT_CONTEXT_CHARS } from "@/lib/admin-agent-context";
import { useVauto } from "@/context/VautoContext";

type AiMode = "checking" | "server" | "personal" | "demo";

export function AiSettingsCard() {
  const { showToast } = useVauto();
  const adminCtx = useAdminProjectContext();
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
  const contextText = adminCtx?.contextText ?? "";
  const setContextText = adminCtx?.setContextText ?? (() => {});
  const saveContext = adminCtx?.saveContext ?? (async () => false);
  const contextHydrated = adminCtx?.hydrated ?? true;
  const contextSaving = adminCtx?.saving ?? false;
  const contextChars = contextText.length;
  const nearContextLimit = contextChars > MAX_ADMIN_PROJECT_CONTEXT_CHARS * 0.9;

  const handleSaveContext = async () => {
    const ok = await saveContext();
    showToast(
      ok
        ? "Gemini kontekstas išsaugotas — bus siunčiamas su jūsų žinutėmis."
        : "Nepavyko išsaugoti konteksto.",
      ok ? "success" : "error"
    );
  };

  const badge =
    mode === "checking"
      ? { label: "Tikrinama…", className: "bg-gray-100 text-gray-500" }
      : mode === "server"
        ? { label: "Serverio AI", className: "bg-green-100 text-green-700" }
        : mode === "personal"
          ? { label: "Asmeninis raktas", className: "bg-blue-100 text-blue-700" }
          : { label: "Demo režimas", className: "bg-amber-100 text-amber-700" };

  return (
    <div className="card-shadow mt-6 rounded-2xl bg-white p-4 text-slate-900">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-[var(--vauto-orange)]" />
        <h2 className="font-semibold text-slate-900">AI nustatymai</h2>
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
        <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
          <KeyRound className="h-3.5 w-3.5" />
          Asmeninis raktas: {masked}
        </p>
      )}

      <section className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
        <h3 className="text-sm font-semibold text-slate-900">
          Gemini pokalbių istorijos sinchronizavimas
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          Įklijuokite Gemini pokalbio transkriptą ar projekto medžiagą. Ji bus įterpta į
          VAUTO agento kontekstą tik jūsų (admin) žinutėms.
        </p>
        {!contextHydrated ? (
          <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Kraunama…
          </div>
        ) : (
          <>
            <textarea
              value={contextText}
              onChange={(e) => setContextText(e.target.value)}
              rows={8}
              placeholder="Įklijuokite čia Gemini pokalbių istoriją…"
              className="mt-3 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              maxLength={MAX_ADMIN_PROJECT_CONTEXT_CHARS}
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p
                className={`text-[11px] ${nearContextLimit ? "font-medium text-amber-700" : "text-slate-500"}`}
              >
                {contextChars.toLocaleString("lt-LT")} /{" "}
                {MAX_ADMIN_PROJECT_CONTEXT_CHARS.toLocaleString("lt-LT")} simbolių
              </p>
              <button
                type="button"
                onClick={() => void handleSaveContext()}
                disabled={contextSaving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {contextSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Išsaugoti kontekstą
              </button>
            </div>
          </>
        )}
      </section>

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
        <p className="mb-3 text-xs text-slate-600">{testResult}</p>
      )}

      <details className="group">
        <summary className="cursor-pointer text-xs font-medium text-slate-500">
          Naudoti savo OpenAI raktą (nebūtina)
        </summary>
        <div className="mt-3">
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={personalKey ? "Įveskite naują raktą..." : "sk-..."}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-slate-900 outline-none focus:border-[var(--vauto-blue)] focus:ring-2 focus:ring-[var(--vauto-blue)]/20"
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
                className="flex items-center justify-center rounded-xl border border-gray-200 px-3 text-slate-500"
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
