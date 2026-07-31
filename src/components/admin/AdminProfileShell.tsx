"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminReportInbox } from "@/components/admin/AdminReportInbox";
import { AdminListingModeration } from "@/components/admin/AdminListingModeration";
import { AdminAccountPanel } from "@/components/admin/AdminAccountPanel";
import { AdminGeminiContextPanel } from "@/components/admin/AdminGeminiContextPanel";
import { AdminOpsPanel } from "@/components/admin/AdminOpsPanel";
import { SegmentedTabs, type SegmentedTabItem } from "@/components/ui/surface";
import { useVauto } from "@/context/VautoContext";
import { useAdminProjectContext } from "@/context/AdminProjectContext";
import { useAuth } from "@/context/AuthContext";

type AdminTab = "ops" | "moderation" | "listings" | "agent" | "account";

function parseAdminTab(raw: string | null): AdminTab | null {
  if (
    raw === "ops" ||
    raw === "moderation" ||
    raw === "listings" ||
    raw === "agent" ||
    raw === "account"
  ) {
    return raw;
  }
  if (raw === "sistema" || raw === "health" || raw === "status") return "ops";
  if (raw === "ai" || raw === "gemini" || raw === "context") return "agent";
  return null;
}

export function AdminProfileShell() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<AdminTab>(
    () => parseAdminTab(searchParams.get("tab")) ?? "moderation"
  );
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

  // Tabs stay bookmarkable / shareable — admins swap context via URL.
  const handleTabChange = useCallback(
    (next: AdminTab) => {
      setTab(next);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      params.delete("report");
      router.replace(`${pathname || "/profile/"}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const tabs = useMemo<SegmentedTabItem<AdminTab>[]>(
    () => [
      { id: "moderation", label: "Pranešimai", shortLabel: "Praneš." },
      {
        id: "listings",
        label: "Skelbimai",
        shortLabel: "Skelb.",
        badge: pendingReviewCount,
      },
      { id: "ops", label: "Sistemos būsena", shortLabel: "Sistema" },
      { id: "agent", label: "AI kontekstas", shortLabel: "AI" },
      { id: "account", label: "Mano paskyra", shortLabel: "Paskyra" },
    ],
    [pendingReviewCount]
  );

  const geminiChars = geminiCtx?.contextText.length ?? 0;

  return (
    <div className="vauto-dashboard min-h-dvh pb-24">
      <header className="sticky top-0 z-10 border-b border-[var(--vauto-border)] bg-[color-mix(in_srgb,var(--vauto-card-bg)_92%,transparent)] px-4 py-3 backdrop-blur">
        <h1 className="vauto-page-title">Control Center</h1>
        <p className="vauto-page-subtitle">VAUTO administratoriaus valdymas</p>
        <SegmentedTabs
          items={tabs}
          value={tab}
          onChange={handleTabChange}
          ariaLabel="Administratoriaus skirtukai"
          className="mt-3"
        />
      </header>

      {tab === "ops" ? (
        <AdminOpsPanel />
      ) : tab === "moderation" ? (
        <Suspense
          fallback={
            <p className="py-16 text-center text-sm text-[var(--vauto-text-muted)]">
              Kraunama moderacija…
            </p>
          }
        >
          <AdminReportInbox embedded />
        </Suspense>
      ) : tab === "listings" ? (
        <AdminListingModeration />
      ) : tab === "agent" ? (
        <div className="space-y-3 px-4 pt-4 pb-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="vauto-panel-eyebrow">
              Gemini kontekstas
              {geminiChars > 0
                ? ` · ${geminiChars.toLocaleString("lt-LT")} simb.`
                : " · tuščias"}
            </p>
            <Link
              href="/admin/ai/"
              className="text-xs font-semibold text-[var(--vauto-primary)] underline-offset-4 hover:underline"
            >
              Pilnas puslapis →
            </Link>
          </div>
          <AdminGeminiContextPanel />
        </div>
      ) : (
        <AdminAccountPanel onLogout={logout} />
      )}
    </div>
  );
}
