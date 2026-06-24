"use client";

import { Suspense, useState } from "react";
import { AdminReportInbox } from "@/components/admin/AdminReportInbox";
import { AdminListingModeration } from "@/components/admin/AdminListingModeration";
import { AdminAccountPanel } from "@/components/admin/AdminAccountPanel";
import { useAuth } from "@/context/AuthContext";

type AdminTab = "moderation" | "listings" | "account";

export function AdminProfileShell() {
  const [tab, setTab] = useState<AdminTab>("moderation");
  const { logout } = useAuth();

  return (
    <div className="vauto-dashboard min-h-dvh pb-24">
      <div className="sticky top-0 z-10 border-b border-white/10 bg-[#0b1220]/95 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-bold text-white">Administratorius</h1>
        <div className="mt-3 flex gap-2">
          {(
            [
              { id: "moderation" as const, label: "Pranešimai" },
              { id: "listings" as const, label: "Skelbimai" },
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
                  : "bg-white/10 text-slate-300"
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
            <div className="flex min-h-[40vh] items-center justify-center text-slate-400">
              Kraunama moderacija…
            </div>
          }
        >
          <AdminReportInbox embedded />
        </Suspense>
      ) : tab === "listings" ? (
        <AdminListingModeration />
      ) : (
        <AdminAccountPanel onLogout={logout} />
      )}
    </div>
  );
}
