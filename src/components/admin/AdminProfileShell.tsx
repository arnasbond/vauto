"use client";

import { Suspense, useState } from "react";
import { AdminReportInbox } from "@/components/admin/AdminReportInbox";
import { AdminListingModeration } from "@/components/admin/AdminListingModeration";
import { AdminAccountPanel } from "@/components/admin/AdminAccountPanel";
import { AdminGeminiContextPanel } from "@/components/admin/AdminGeminiContextPanel";
import { useAuth } from "@/context/AuthContext";

type AdminTab = "moderation" | "listings" | "agent" | "account";

export function AdminProfileShell() {
  const [tab, setTab] = useState<AdminTab>("moderation");
  const { logout } = useAuth();

  return (
    <div className="vauto-dashboard min-h-dvh pb-24">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-bold text-slate-900">Administratorius</h1>
        <div className="mt-3 flex gap-2">
          {(
            [
              { id: "moderation" as const, label: "Pranešimai" },
              { id: "listings" as const, label: "Skelbimai" },
              { id: "agent" as const, label: "AI kontekstas" },
              { id: "account" as const, label: "Mano paskyra" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                tab === item.id
                  ? "bg-[var(--vauto-teal)] text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "moderation" ? (
        <Suspense
          fallback={
            <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
              Kraunama moderacija…
            </div>
          }
        >
          <AdminReportInbox embedded />
        </Suspense>
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
