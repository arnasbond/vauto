"use client";

import { Check, Link2, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WardrobeValueShareCard } from "@/components/clothing/WardrobeValueShareCard";
import {
  apiGetPortalLinks,
  apiImportWardrobeProfile,
  apiLinkPortalProfile,
  apiUnlinkPortal,
} from "@/lib/api/client";
import {
  isValidPortalUrl,
  shortenProfileUrl,
  WARDROBE_PORTALS,
  type UserPortalLinkDto,
} from "@/lib/spinta-portal";
import {
  profileItemToDraft,
  computeWardrobeValueTotal,
  type WardrobeProfileImportItem,
} from "@/lib/wardrobe-profile-importer";
import type { AiExtractedListing } from "@/lib/types";

interface PortalLinksCenterProps {
  userName?: string;
  defaultLocation: string;
  contact: string;
  guestMode?: boolean;
  onImportReady?: (drafts: AiExtractedListing[], voiceAnnouncement: string) => void;
  onGuestPreview?: (items: WardrobeProfileImportItem[], drafts: AiExtractedListing[]) => void;
  onToast?: (message: string, type?: "success" | "error" | "info") => void;
}

export function PortalLinksCenter({
  userName,
  defaultLocation,
  contact,
  guestMode = false,
  onImportReady,
  onGuestPreview,
  onToast,
}: PortalLinksCenterProps) {
  const [links, setLinks] = useState<UserPortalLinkDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [draftUrl, setDraftUrl] = useState("");
  const [syncingKey, setSyncingKey] = useState<string | null>(null);
  const [valueCard, setValueCard] = useState<{
    total: number;
    count: number;
  } | null>(null);

  const linkByKey = useMemo(() => {
    const map = new Map<string, UserPortalLinkDto>();
    for (const link of links) map.set(link.portalKey, link);
    return map;
  }, [links]);

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
      if (!guestMode) {
        await apiLinkPortalProfile({ portalKey, profileUrl: trimmed });
      }

      const result = await apiImportWardrobeProfile({
        profileUrl: trimmed,
        userName,
        defaultLocation,
        persistLink: !guestMode,
        portalKey,
      });

      if (!result?.items.length) {
        onToast?.("Importas nepavyko — bandykite vėliau.", "info");
        return;
      }

      setDraftUrl("");
      await refreshLinks();

      const total =
        result.wardrobeValueTotal ?? computeWardrobeValueTotal(result.items);
      const count = result.itemCount ?? result.items.length;
      if (!guestMode) {
        setValueCard({ total, count });
      }

      const drafts = result.items.map((item) =>
        profileItemToDraft(item, contact || "+370", defaultLocation)
      );

      if (guestMode) {
        onGuestPreview?.(result.items, drafts);
      } else {
        onImportReady?.(drafts, result.voiceAnnouncement);
      }
      onToast?.(result.voiceAnnouncement, "success");
    } catch {
      onToast?.("Sinchronizacija nepavyka — bandykite dar kartą.", "error");
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

  return (
    <div className="mb-6 overflow-hidden rounded-3xl border border-fuchsia-500/50 bg-[#131c38] p-4 shadow-lg">
      {valueCard && !guestMode && (
        <WardrobeValueShareCard
          wardrobeValueTotal={valueCard.total}
          itemCount={valueCard.count}
          userName={userName}
          onDismiss={() => setValueCard(null)}
        />
      )}

      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">Portalų sinchronizacija</p>
          <p className="text-[11px] text-slate-400">
            Skelbiu, Autoplius, Aruodas, Paslaugos.lt, Vinted, Marktplaats — automatinis
            atnaujinimas kas <span className="text-fuchsia-300">3 dienas</span>
          </p>
        </div>
        {!guestMode && (
          <button
            type="button"
            onClick={() => void refreshLinks()}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
            aria-label="Atnaujinti būseną"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="space-y-2">
        {WARDROBE_PORTALS.map((portal) => {
          const linked = linkByKey.get(portal.key);
          const isSyncing =
            syncingKey === portal.key ||
            linked?.status === "syncing" ||
            (loading && syncingKey === portal.key);
          const isExpanded = expandedKey === portal.key;

          if (linked && linked.status !== "error" && !isExpanded) {
            return (
              <div
                key={portal.key}
                className="flex items-center gap-2 rounded-2xl border border-fuchsia-500/30 bg-[#0a1128] px-3 py-2"
              >
                <span className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-600/25 px-2.5 py-1 text-xs font-medium text-fuchsia-100">
                  {isSyncing ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      [{portal.label}] Sinchronizuojama…
                    </>
                  ) : (
                    <>
                      <Check className="h-3 w-3" />
                      [{portal.label}] Paskyra sinchronizuota
                    </>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
                  {linked.itemCount > 0 && `${linked.itemCount} prekės · `}
                  {shortenProfileUrl(linked.profileUrl)}
                </span>
                {!guestMode && (
                  <button
                    type="button"
                    onClick={() => void handleUnlink(portal.key)}
                    className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-white"
                    aria-label={`Atjungti ${portal.label}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
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
    </div>
  );
}
