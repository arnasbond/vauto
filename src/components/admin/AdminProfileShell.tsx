"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Pencil, Sparkles } from "lucide-react";
import { AdminReportInbox } from "@/components/admin/AdminReportInbox";
import { AdminListingModeration } from "@/components/admin/AdminListingModeration";
import { AdminAccountPanel } from "@/components/admin/AdminAccountPanel";
import { AdminGeminiContextPanel } from "@/components/admin/AdminGeminiContextPanel";
import {
  ADMIN_GEMINI_BUILD,
  AdminGeminiUploadPanel,
} from "@/components/admin/AdminGeminiUploadPanel";
import { useVauto } from "@/context/VautoContext";
import { useAdminProjectContext } from "@/context/AdminProjectContext";
import { useAuth } from "@/context/AuthContext";

type AdminTab = "moderation" | "listings" | "agent" | "account";

const GEMINI_COLLAPSED_STORAGE_KEY = "vauto_admin_gemini_collapsed_v1";

const ADMIN_TABS: { id: AdminTab; label: string; shortLabel: string }[] = [
  { id: "moderation", label: "Pranešimai", shortLabel: "Praneš." },
  { id: "listings", label: "Skelbimai", shortLabel: "Skelbimai" },
  { id: "agent", label: "AI kontekstas", shortLabel: "Gemini" },
  { id: "account", label: "Mano paskyra", shortLabel: "Paskyra" },
];

function parseAdminTab(raw: string | null): AdminTab | null {
  if (raw === "moderation" || raw === "listings" || raw === "agent" || raw === "account") {
    return raw;
  }
  if (raw === "ai" || raw === "gemini" || raw === "context") return "agent";
  return null;
}

export function AdminProfileShell() {
  const searchParams = useSearchParams();
  const initialTab = parseAdminTab(searchParams.get("tab")) ?? "moderation";
  const [tab, setTab] = useState<AdminTab>(initialTab);
  const [geminiCollapsed, setGeminiCollapsed] = useState(false);
  const { logout } = useAuth();
  const { listings } = useVauto();
  const geminiCtx = useAdminProjectContext();

  const pendingReviewCount = useMemo(
    () => listings.filter((l) => l.requiresReview && !l.banned).length,
    [listings]
  );

  useEffect(() => {
    const fromUrl = parseAdminTab(searchParams.get("tab"));
    if (fromUrl) setTab(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setGeminiCollapsed(sessionStorage.getItem(GEMINI_COLLAPSED_STORAGE_KEY) === "1");
  }, []);

  const collapseGemini = () => {
    setGeminiCollapsed(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(GEMINI_COLLAPSED_STORAGE_KEY, "1");
    }
  };

  const expandGemini = () => {
    setGeminiCollapsed(false);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(GEMINI_COLLAPSED_STORAGE_KEY);
    }
  };

  const geminiChars = geminiCtx?.contextText.length ?? 0;

  return (
    <div className="vauto-dashboard min-h-dvh pb-24">
      <div className="border-b border-indigo-100 bg-indigo-50/80 px-4 py-2">
        {geminiCollapsed ? (
          <div className="flex items-center justify-between gap-3 py-1">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-indigo-800">
                Gemini AI kontekstas
                {geminiChars > 0
                  ? ` · ${geminiChars.toLocaleString("lt-LT")} simb.`
                  : " · tuščias"}
              </p>
            </div>
            <button
              type="button"
              onClick={expandGemini}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-700"
            >
              <Pencil className="h-3.5 w-3.5" />
              Redaguoti AI kontekstą
            </button>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                Gemini AI kontekstas
              </p>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-mono text-[10px] text-indigo-700">
                  {ADMIN_GEMINI_BUILD}
                </span>
                <button
                  type="button"
                  onClick={collapseGemini}
                  className="rounded-lg p-1 text-indigo-600 hover:bg-indigo-100"
                  aria-label="Suskleisti Gemini kontekstą"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            </div>
            <AdminGeminiUploadPanel compact onSaved={collapseGemini} />
            <Link
              href="/admin/ai/"
              className="mt-2 block text-center text-xs font-semibold text-indigo-700 underline"
            >
              Atidaryti pilną Gemini puslapį →
            </Link>
          </>
        )}
      </div>

      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-bold text-slate-900">Administratorius</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          VAUTO Control Center — slinkite skirtukus į šoną, jei nematote visų.
        </p>
        <div className="mt-3 -mx-1 overflow-x-auto px-1 pb-1 scrollbar-hide">
          <div className="flex w-max min-w-full gap-2">
            {ADMIN_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold whitespace-nowrap ${
                  tab === item.id
                    ? "bg-[var(--vauto-teal)] text-white shadow-sm"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                <span className="sm:hidden">{item.shortLabel}</span>
                <span className="hidden sm:inline">{item.label}</span>
                {item.id === "listings" && pendingReviewCount > 0 ? (
                  <span className="ml-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {pendingReviewCount}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === "moderation" ? (
        <>
          <button
            type="button"
            onClick={() => setTab("agent")}
            className="mx-4 mt-4 flex w-[calc(100%-2rem)] items-center gap-3 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 px-4 py-3 text-left shadow-sm transition hover:border-indigo-300"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <Sparkles className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-900">
                Gemini pokalbių istorija
              </span>
              <span className="block text-xs text-slate-600">
                Atidaryti AI konteksto įkėlimą →
              </span>
            </span>
          </button>
          <Suspense
            fallback={
              <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
                Kraunama moderacija…
              </div>
            }
          >
            <AdminReportInbox embedded />
          </Suspense>
        </>
      ) : tab === "listings" ? (
        <AdminListingModeration />
      ) : tab === "agent" ? (
        <div className="pb-8">
          <AdminGeminiContextPanel />
        </div>
      ) : (
        <AdminAccountPanel onLogout={logout} />
      )}
    </div>
  );
}
