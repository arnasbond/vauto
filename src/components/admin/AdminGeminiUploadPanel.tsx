"use client";

import { Loader2, Save, Sparkles } from "lucide-react";
import { MAX_ADMIN_PROJECT_CONTEXT_CHARS } from "@/lib/admin-agent-context";
import { useAdminProjectContext } from "@/context/AdminProjectContext";
import { useVauto } from "@/context/VautoContext";

export const ADMIN_GEMINI_BUILD = "2026-06-24-gemini-v3";

const GEMINI_COLLAPSED_STORAGE_KEY = "vauto_admin_gemini_collapsed_v1";

export function AdminGeminiUploadPanel({
  compact = false,
  onSaved,
}: {
  compact?: boolean;
  onSaved?: () => void;
}) {
  const { showToast, isAdmin } = useVauto();
  const ctx = useAdminProjectContext();

  const chars = ctx?.contextText.length ?? 0;
  const nearLimit = chars > MAX_ADMIN_PROJECT_CONTEXT_CHARS * 0.9;

  const handleSave = async () => {
    if (!ctx) return;
    const ok = await ctx.saveContext();
    if (ok) {
      onSaved?.();
      if (typeof window !== "undefined") {
        sessionStorage.setItem(GEMINI_COLLAPSED_STORAGE_KEY, "1");
      }
    }
    showToast(
      ok
        ? "Gemini kontekstas išsaugotas — bus siunčiamas su jūsų žinutėmis."
        : "Nepavyko išsaugoti konteksto.",
      ok ? "success" : "error"
    );
  };

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Tik administratoriams. Prisijunkite per „VAUTO Control Center (admin)“.
      </div>
    );
  }

  if (!ctx) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Kraunama admin kontekstą…
      </div>
    );
  }

  const { contextText, setContextText, hydrated, saving } = ctx;

  return (
    <section
      className={`rounded-2xl border-2 border-indigo-300 bg-gradient-to-br from-indigo-50 via-white to-violet-50 shadow-md ${
        compact ? "p-3" : "p-4"
      }`}
      data-admin-gemini-panel={ADMIN_GEMINI_BUILD}
    >
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-900">
            Gemini pokalbių istorijos sinchronizavimas
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Įklijuokite Gemini pokalbio transkriptą. Kontekstas bus įterptas į VAUTO agentą
            tik jūsų (admin) žinutėms.
          </p>
          <p className="mt-1 text-[10px] font-mono text-indigo-600">
            Versija: {ADMIN_GEMINI_BUILD}
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
          <textarea
            value={contextText}
            onChange={(e) => setContextText(e.target.value)}
            rows={compact ? 6 : 12}
            placeholder="Įklijuokite čia Gemini pokalbių istoriją…"
            className="w-full resize-y rounded-xl border-2 border-indigo-200 bg-white px-3 py-3 font-mono text-xs leading-relaxed text-slate-900 shadow-inner focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            maxLength={MAX_ADMIN_PROJECT_CONTEXT_CHARS}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p
              className={`text-[11px] ${nearLimit ? "font-semibold text-amber-700" : "text-slate-500"}`}
            >
              {chars.toLocaleString("lt-LT")} /{" "}
              {MAX_ADMIN_PROJECT_CONTEXT_CHARS.toLocaleString("lt-LT")} simbolių
            </p>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-indigo-700 disabled:opacity-60"
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
