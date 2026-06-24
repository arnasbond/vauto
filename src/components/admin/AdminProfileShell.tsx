"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import { AdminReportInbox } from "@/components/admin/AdminReportInbox";
import { AdminListingModeration } from "@/components/admin/AdminListingModeration";
import { AdminAccountPanel } from "@/components/admin/AdminAccountPanel";
import { AdminGeminiContextPanel } from "@/components/admin/AdminGeminiContextPanel";
import {
  ADMIN_GEMINI_BUILD,
  AdminGeminiUploadPanel,
} from "@/components/admin/AdminGeminiUploadPanel";
import { useAuth } from "@/context/AuthContext";

type AdminTab = "moderation" | "listings" | "agent" | "account";

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
  const { logout } = useAuth();

  useEffect(() => {
    const fromUrl = parseAdminTab(searchParams.get("tab"));
    if (fromUrl) setTab(fromUrl);
  }, [searchParams]);

  return (
    <div className="vauto-dashboard min-h-dvh pb-24">
      <div className="border-b border-indigo-100 bg-indigo-50/80 px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            Gemini AI kontekstas
          </p>
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-mono text-[10px] text-indigo-700">
            {ADMIN_GEMINI_BUILD}
          </span>
        </div>
        <AdminGeminiUploadPanel compact />
        <Link
          href="/admin/ai/"
          className="mt-3 block text-center text-xs font-semibold text-indigo-700 underline"
        >
          Atidaryti pilną Gemini puslapį →
        </Link>
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
