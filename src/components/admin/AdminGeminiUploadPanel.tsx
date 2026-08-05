"use client";

import { Loader2, Save, Sparkles } from "lucide-react";
import { AiInsightCard, Badge, Button, Card } from "@/design-system";
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
      <Card variant="warning" className="text-sm">
        Tik administratoriams. Prisijunkite per „VAUTO Control Center (admin)“.
      </Card>
    );
  }

  if (!ctx) {
    return (
      <Card
        variant="muted"
        className="flex items-center gap-2 text-sm text-[var(--ds-text-muted)]"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Kraunama admin kontekstą…
      </Card>
    );
  }

  const { contextText, setContextText, hydrated, saving } = ctx;
  const preview =
    contextText.trim().slice(0, compact ? 280 : 600) ||
    "// Dar nėra konteksto — įklijuokite Gemini transcriptą.";

  return (
    <div className="space-y-3" data-admin-gemini-panel={ADMIN_GEMINI_BUILD}>
      <AiInsightCard
        title="Gemini Context Inspector"
        body="Įklijuokite Gemini pokalbio transkriptą. Kontekstas bus įterptas į VAUTO agentą tik jūsų (admin) žinutėms — be papildomos API logikos."
      />

      <Card variant="ai" className={compact ? "p-3" : "p-4"}>
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--ds-radius-control)] bg-[var(--ds-ai)] text-[var(--ds-ai-contrast)] shadow">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-[var(--ds-text-primary)]">
                Gemini pokalbių istorijos sinchronizavimas
              </h2>
              <Badge tone="ai">Inspector</Badge>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--ds-text-secondary)]">
              Sistemos promptų ir konteksto peržiūra · Mission Control 2.0
            </p>
            <p className="mt-1 font-mono text-[10px] text-[var(--ds-ai-strong)]">
              Versija: {ADMIN_GEMINI_BUILD}
            </p>
          </div>
        </div>

        {!hydrated ? (
          <div className="flex items-center gap-2 py-6 text-sm text-[var(--ds-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Kraunama…
          </div>
        ) : (
          <>
            <pre
              className="mb-3 max-h-40 overflow-auto rounded-[var(--ds-radius-control)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-inverse,#0b1220)] p-3 font-mono text-[11px] leading-relaxed text-[var(--ds-text-inverse,#e8eef7)]"
              aria-label="Konteksto peržiūra"
            >
              {preview}
              {contextText.trim().length > (compact ? 280 : 600) ? "\n…" : ""}
            </pre>

            <textarea
              value={contextText}
              onChange={(e) => setContextText(e.target.value)}
              rows={compact ? 6 : 12}
              placeholder="Įklijuokite čia Gemini pokalbių istoriją…"
              className="w-full resize-y rounded-[var(--ds-radius-control)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-inverse,#0b1220)] px-3 py-3 font-mono text-xs leading-relaxed text-[var(--ds-text-inverse,#e8eef7)] shadow-inner focus:border-[var(--ds-ai)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-ai)]/30"
              maxLength={MAX_ADMIN_PROJECT_CONTEXT_CHARS}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p
                className={`text-[11px] ${
                  nearLimit
                    ? "font-semibold text-[var(--ds-warning)]"
                    : "text-[var(--ds-text-muted)]"
                }`}
              >
                {chars.toLocaleString("lt-LT")} /{" "}
                {MAX_ADMIN_PROJECT_CONTEXT_CHARS.toLocaleString("lt-LT")}{" "}
                simbolių
              </p>
              <Button
                variant="ai"
                onClick={() => void handleSave()}
                disabled={saving}
                leftIcon={
                  saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )
                }
              >
                Išsaugoti kontekstą
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
