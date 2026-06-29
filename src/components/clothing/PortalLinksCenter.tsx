"use client";

import { ChevronDown, Link2, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WardrobeValueShareCard } from "@/components/clothing/WardrobeValueShareCard";
import { useVauto } from "@/context/VautoContext";
import {
  apiGetPortalLinks,
  apiImportWardrobeProfile,
  apiLinkPortalProfile,
  apiSpintaSync,
  apiUnlinkPortal,
} from "@/lib/api/client";
import {
  isValidPortalUrl,
  shortenProfileUrl,
  type UserPortalLinkDto,
} from "@/lib/spinta-portal";
import { portalsForProfileType, type ProfileType } from "@/lib/profile-type";
import {
  profileItemToDraft,
  type WardrobeProfileImportItem,
} from "@/lib/wardrobe-profile-importer";
import { cn } from "@/lib/cn";
import type { AiExtractedListing } from "@/lib/types";

const PORTAL_SYNC_EXPANDED_KEY = "vauto_portal_sync_expanded";

function readPortalSyncExpanded(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = localStorage.getItem(PORTAL_SYNC_EXPANDED_KEY);
    if (stored === "0") return false;
    if (stored === "1") return true;
  } catch {
    /* ignore */
  }
  return true;
}

function persistPortalSyncExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(PORTAL_SYNC_EXPANDED_KEY, expanded ? "1" : "0");
  } catch {
    /* ignore */
  }
}

interface PortalLinksCenterProps {
  userName?: string;
  defaultLocation: string;
  contact: string;
  profileType?: ProfileType | null;
  guestMode?: boolean;
  onImportReady?: (drafts: AiExtractedListing[], voiceAnnouncement: string) => void;
  onGuestPreview?: (items: WardrobeProfileImportItem[], drafts: AiExtractedListing[]) => void;
  onToast?: (message: string, type?: "success" | "error" | "info") => void;
}

export function PortalLinksCenter({
  userName,
  defaultLocation,
  contact,
  profileType,
  guestMode = false,
  onImportReady,
  onGuestPreview,
  onToast,
}: PortalLinksCenterProps) {
  const { refreshListingsCatalog } = useVauto();
  const [links, setLinks] = useState<UserPortalLinkDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [draftUrl, setDraftUrl] = useState("");
  const [syncingKey, setSyncingKey] = useState<string | null>(null);
  const [sectionOpen, setSectionOpen] = useState(true);
  const [valueCard, setValueCard] = useState<{
    total: number;
    count: number;
  } | null>(null);

  const portalList = useMemo(
    () => portalsForProfileType(profileType),
    [profileType]
  );

  const linkByKey = useMemo(() => {
    const map = new Map<string, UserPortalLinkDto>();
    for (const link of links) map.set(link.portalKey, link);
    return map;
  }, [links]);

  const syncedCount = useMemo(
    () =>
      links.filter((l) => l.status === "synced" || l.status === "syncing").length,
    [links]
  );

  useEffect(() => {
    setSectionOpen(readPortalSyncExpanded());
  }, []);

  const toggleSection = () => {
    setSectionOpen((prev) => {
      const next = !prev;
      persistPortalSyncExpanded(next);
      return next;
    });
  };

  const refreshLinks = useCallback(async () => {
    if (guestMode) return;
    const res = await apiGetPortalLinks();
    if (res.ok && res.data?.links) {
      setLinks(res.data.links as UserPortalLinkDto[]);
    }
  }, [guestMode]);

  useEffect(() => {
    void refreshLinks();
  }, [refreshLinks]);

  const runPortalSync = useCallback(
    async (
      portalKey: string,
      profileUrl: string,
      options: { force?: boolean; linkFirst?: boolean } = {}
    ): Promise<{ ok: boolean; itemCount: number; voice: string }> => {
      const trimmed = profileUrl.trim();

      if (guestMode) {
        const result = await apiImportWardrobeProfile({
          profileUrl: trimmed,
          userName,
          defaultLocation,
          persistLink: false,
          portalKey,
        });
        if (!result?.items.length) {
          return { ok: false, itemCount: 0, voice: "" };
        }
        const drafts = result.items.map((item) =>
          profileItemToDraft(item, contact || "+370", defaultLocation)
        );
        onGuestPreview?.(result.items, drafts);
        return {
          ok: true,
          itemCount: result.items.length,
          voice: result.voiceAnnouncement,
        };
      }

      if (options.linkFirst) {
        await apiLinkPortalProfile({ portalKey, profileUrl: trimmed });
      }

      const syncResult = await apiSpintaSync({
        profileUrl: trimmed,
        portalKey,
        userName,
        defaultLocation,
        force: options.force,
      });

      if (!syncResult?.ok || syncResult.status === "error") {
        return { ok: false, itemCount: 0, voice: syncResult?.error ?? "" };
      }

      await refreshListingsCatalog();
      await refreshLinks();

      const count = syncResult.itemCount ?? 0;
      const firstName = userName?.trim().split(/\s+/)[0] || "drauge";
      const voice =
        count > 0
          ? `${firstName}, sinchronizavau ${count} prek${count === 1 ? "ę" : "es"} — atnaujinta tavo spinta!`
          : `${firstName}, portale prekių neradau — patikrink nuorodą.`;

      return { ok: true, itemCount: count, voice };
    },
    [
      contact,
      defaultLocation,
      guestMode,
      onGuestPreview,
      refreshLinks,
      refreshListingsCatalog,
      userName,
    ]
  );

  const handleConnect = async (portalKey: string) => {
    const trimmed = draftUrl.trim();
    if (!isValidPortalUrl(trimmed, portalKey)) {
      onToast?.("Įveskite galiojančią šio portalo profilio nuorodą.", "info");
      return;
    }

    setSyncingKey(portalKey);
    setLoading(true);
    setExpandedKey(null);

    try {
      const outcome = await runPortalSync(portalKey, trimmed, { linkFirst: true });
      if (!outcome.ok) {
        onToast?.("Sinchronizacija nepavyko — bandykite dar kartą.", "error");
        return;
      }

      setDraftUrl("");

      if (!guestMode && outcome.itemCount > 0) {
        setValueCard({ total: 0, count: outcome.itemCount });
      }

      if (!guestMode) {
        onImportReady?.([], outcome.voice);
      }
      onToast?.(outcome.voice, "success");
    } catch {
      onToast?.("Sinchronizacija nepavyko — bandykite dar kartą.", "error");
    } finally {
      setLoading(false);
      setSyncingKey(null);
    }
  };

  const handleResync = async (portalKey: string, profileUrl: string) => {
    setSyncingKey(portalKey);
    setLoading(true);
    try {
      const outcome = await runPortalSync(portalKey, profileUrl, { force: true });
      if (!outcome.ok) {
        onToast?.("Sinchronizacija nepavyko — bandykite dar kartą.", "error");
        return;
      }
      if (!guestMode && outcome.itemCount > 0) {
        setValueCard({ total: 0, count: outcome.itemCount });
      }
      onImportReady?.([], outcome.voice);
      onToast?.(outcome.voice, "success");
    } catch {
      onToast?.("Sinchronizacija nepavyko — bandykite dar kartą.", "error");
    } finally {
      setLoading(false);
      setSyncingKey(null);
    }
  };

  const handleUnlink = async (portalKey: string) => {
    const res = await apiUnlinkPortal(portalKey);
    if (res.ok) {
      setLinks((prev) => prev.filter((l) => l.portalKey !== portalKey));
      onToast?.("Portalas atjungtas.", "info");
    }
  };

  const subtitle =
    profileType === "business"
      ? "Skelbiu, Autoplius, Aruodas, Paslaugos.lt — automatinis atnaujinimas kas"
      : profileType === "private"
        ? "Vinted, Marktplaats, Depop — automatinis atnaujinimas kas"
        : "Skelbiu, Autoplius, Aruodas, Paslaugos.lt, Vinted, Marktplaats — automatinis atnaujinimas kas";

  return (
    <div className="mb-6 overflow-hidden rounded-3xl border border-fuchsia-500/50 bg-[#131c38] p-4 shadow-lg">
      {valueCard && !guestMode && sectionOpen && (
        <WardrobeValueShareCard
          wardrobeValueTotal={valueCard.total}
          itemCount={valueCard.count}
          userName={userName}
          onDismiss={() => setValueCard(null)}
        />
      )}

      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={toggleSection}
          className="min-w-0 flex-1 text-left"
          aria-expanded={sectionOpen}
          aria-controls="portal-sync-panel"
        >
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white">Portalų sinchronizacija</p>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200",
                sectionOpen && "rotate-180"
              )}
              aria-hidden
            />
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {subtitle}{" "}
            <span className="text-fuchsia-300">3 dienas</span>
            {!sectionOpen && syncedCount > 0 && (
              <span className="text-emerald-400/90">
                {" "}
                · {syncedCount} sinchronizuota
              </span>
            )}
          </p>
        </button>
        {!guestMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void refreshLinks();
            }}
            className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
            aria-label="Atnaujinti būseną"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      </div>

      {sectionOpen && (
        <div id="portal-sync-panel" className="mt-3 space-y-2">
          {portalList.map((portal) => {
            const linked = linkByKey.get(portal.key);
            const isSynced =
              Boolean(linked) && linked?.status !== "error";
            const isSyncing =
              syncingKey === portal.key ||
              linked?.status === "syncing" ||
              (loading && syncingKey === portal.key);
            const isExpanded = expandedKey === portal.key;

            if (isSynced && !isExpanded) {
              return (
                <div
                  key={portal.key}
                  className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-[#0a1128]/60 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-200">{portal.label}</p>
                    {!isSyncing && linked && (
                      <p className="truncate text-[10px] text-slate-500">
                        {linked.itemCount > 0 && `${linked.itemCount} prekės · `}
                        {shortenProfileUrl(linked.profileUrl)}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {isSyncing ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-fuchsia-300">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Sinchronizuojama…
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-emerald-400/95">
                        🟢 Sinchronizuota
                      </span>
                    )}
                    {!guestMode && !isSyncing && linked && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            void handleResync(portal.key, linked.profileUrl)
                          }
                          className="rounded-md p-1 text-slate-400 opacity-70 transition hover:bg-white/5 hover:text-fuchsia-300 hover:opacity-100"
                          aria-label={`Sinchronizuoti ${portal.label} dar kartą`}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleUnlink(portal.key)}
                          className="rounded-md p-1 text-slate-500 opacity-70 transition hover:bg-white/5 hover:text-slate-300 hover:opacity-100"
                          aria-label={`Atjungti ${portal.label}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            }

            if (isExpanded) {
              return (
                <div
                  key={portal.key}
                  className="rounded-2xl border border-fuchsia-500/40 bg-[#0a1128] p-3"
                >
                  <p className="mb-2 text-xs font-medium text-fuchsia-200">
                    {portal.label} profilio nuoroda
                  </p>
                  <input
                    type="url"
                    value={draftUrl}
                    onChange={(e) => setDraftUrl(e.target.value)}
                    placeholder={portal.placeholder}
                    className="mb-2 w-full rounded-xl border border-fuchsia-500/50 bg-[#060b1a] px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-fuchsia-500/30"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={loading || !draftUrl.trim()}
                      onClick={() => void handleConnect(portal.key)}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-fuchsia-600 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {loading && syncingKey === portal.key ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Link2 className="h-3.5 w-3.5" />
                      )}
                      Sinchronizuoti
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedKey(null);
                        setDraftUrl("");
                      }}
                      className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-400"
                    >
                      Atšaukti
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <button
                key={portal.key}
                type="button"
                onClick={() => {
                  setExpandedKey(portal.key);
                  setDraftUrl("");
                }}
                className="flex w-full items-center justify-between rounded-2xl border border-dashed border-fuchsia-500/30 bg-[#0a1128]/60 px-3 py-2.5 text-left transition hover:border-fuchsia-500/50"
              >
                <span className="text-xs text-slate-300">{portal.label}</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-fuchsia-300">
                  <Plus className="h-3.5 w-3.5" />
                  Prijungti
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
