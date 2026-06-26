"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles, Zap } from "lucide-react";
import { apiAiHealthCheck, apiVautoServer } from "@/lib/api/client";
import { clearAllData } from "@/lib/storage";
import { AdminGeminiUploadPanel } from "@/components/admin/AdminGeminiUploadPanel";
import { mapVautoServerListing } from "@/lib/vauto-unified-client";

type AiMode = "checking" | "server" | "demo";

export function AiSettingsCard() {
  const [mode, setMode] = useState<AiMode>("checking");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setMode("checking");
    const health = await apiAiHealthCheck();
    if (health?.gemini) {
      setMode("server");
      return;
    }
    setMode("demo");
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiVautoServer({
        action: "parse_text",
        text: "Parduodu iPhone 13, 320 eurų, puiki būklė, Vilnius",
        userCity: "Vilnius",
        contact: "+370 600 00000",
      });
      if (res && "listing" in res) {
        const listing = mapVautoServerListing(res.listing, "Vilnius");
        setTestResult(`✓ Gemini veikia: „${listing.title}" — ${listing.price}€`);
        setMode("server");
      } else {
        setTestResult("✗ Gemini nepasiekiamas — patikrinkite GEMINI_API_KEY serveryje");
      }
    } catch {
      setTestResult("✗ Gemini testas nepavyko");
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

  const badge =
    mode === "checking"
      ? { label: "Tikrinama…", className: "vauto-badge-muted" }
      : mode === "server"
        ? { label: "Gemini AI", className: "vauto-badge-success" }
        : { label: "Demo režimas", className: "vauto-badge-warning" };

  return (
    <div className="vauto-settings-card mt-6 rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-[var(--vauto-orange)]" />
        <h2 className="vauto-text-heading font-semibold">Gemini AI</h2>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      {mode === "server" && (
        <p className="vauto-badge-success mb-3 rounded-xl px-3 py-2 text-xs">
          Visos AI funkcijos veikia per Vauto serverį (Gemini).
        </p>
      )}

      {mode === "demo" && (
        <p className="vauto-badge-warning mb-3 rounded-xl px-3 py-2 text-xs">
          Gemini serveris nepasiekiamas — naudojami demo duomenys.
        </p>
      )}

      <div className="mb-4">
        <AdminGeminiUploadPanel compact />
      </div>

      <button
        type="button"
        onClick={handleTest}
        disabled={testing}
        className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--vauto-primary)]/30 bg-[color-mix(in_srgb,var(--vauto-primary)_8%,transparent)] py-2.5 text-sm font-medium text-[var(--vauto-primary)] disabled:opacity-60"
      >
        {testing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Zap className="h-4 w-4" />
        )}
        {testing ? "Testuojama…" : "Testuoti Gemini"}
      </button>

      {testResult && <p className="vauto-text-subtle mb-3 text-xs">{testResult}</p>}

      <button
        type="button"
        onClick={handleClearData}
        className="mt-4 w-full rounded-xl border border-red-400/40 py-2 text-xs text-red-400"
      >
        Išvalyti visus duomenis
      </button>
    </div>
  );
}
