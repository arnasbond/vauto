"use client";

import { Loader2, Save, Sparkles } from "lucide-react";
import { useAdminProjectContext } from "@/context/AdminProjectContext";
import { MAX_ADMIN_PROJECT_CONTEXT_CHARS } from "@/lib/admin-agent-context";
import { useVauto } from "@/context/VautoContext";

export function AdminGeminiContextPanel() {
  const { showToast } = useVauto();
  const adminCtx = useAdminProjectContext();

  const { contextText, setContextText, saveContext, hydrated, saving } = adminCtx ?? {
    contextText: "",
    setContextText: () => {},
    saveContext: async () => false,
    hydrated: true,
    saving: false,
  };
  const chars = contextText.length;
  const nearLimit = chars > MAX_ADMIN_PROJECT_CONTEXT_CHARS * 0.9;

  const handleSave = async () => {
    const ok = await saveContext();
    showToast(
      ok
        ? "Gemini kontekstas išsaugotas — bus siunčiamas su jūsų žinutėmis."
        : "Nepavyko išsaugoti konteksto.",
      ok ? "success" : "error"
    );
  };

  return (
    <section className="mx-4 mt-4 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-slate-50 p-4 shadow-sm">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            Gemini pokalbių istorijos sinchronizavimas
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Įklijuokite išorinę Gemini pokalbių istoriją ar projekto medžiagą. Ji bus
            automatiškai įterpta į VAUTO agento kontekstą tik jūsų (admin) žinutėms.
          </p>
        </div>
      </div>

      {!hydrated ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Kraunama…
        </div>
      ) : (
        <>
          <label className="sr-only" htmlFor="admin-gemini-context">
            Gemini pokalbių istorijos sinchronizavimas
          </label>
          <textarea
            id="admin-gemini-context"
            value={contextText}
            onChange={(e) => setContextText(e.target.value)}
            rows={12}
            placeholder="Įklijuokite čia Gemini pokalbių istoriją, architektūros pastabas ar kito AI pokalbio transkriptą…"
            className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs leading-relaxed text-slate-800 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            maxLength={MAX_ADMIN_PROJECT_CONTEXT_CHARS}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p
              className={`text-[11px] ${nearLimit ? "font-medium text-amber-700" : "text-slate-500"}`}
            >
              {chars.toLocaleString("lt-LT")} /{" "}
              {MAX_ADMIN_PROJECT_CONTEXT_CHARS.toLocaleString("lt-LT")} simbolių
            </p>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Išsaugoti kontekstą
            </button>
          </div>
        </>
      )}
    </section>
  );
}
