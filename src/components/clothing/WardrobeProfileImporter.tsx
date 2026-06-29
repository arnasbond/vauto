"use client";

import { Loader2, Sparkles, UploadCloud, X } from "lucide-react";
import { useMemo, useState } from "react";
import { GuestWardrobePreviewGrid } from "@/components/clothing/GuestWardrobePreviewGrid";
import { WardrobeValueShareCard } from "@/components/clothing/WardrobeValueShareCard";
import { useVauto } from "@/context/VautoContext";
import {
  importWardrobeProfile,
  isWardrobeProfileUrl,
  profileItemToDraft,
  computeWardrobeValueTotal,
  type WardrobeProfileImportItem,
} from "@/lib/wardrobe-profile-importer";
import { incrementWardrobeImportCount, buildWardrobePowerSubscriptionCheckout } from "@/lib/monetization-wardrobe";
import {
  canPerformWardrobeProfileImport,
  resolveWardrobeSubscriptionAccess,
} from "@/lib/SubscriptionGuard";
import { detectWardrobePortalLabel, shortenProfileUrl } from "@/lib/spinta-portal";
import { isGuestUserId } from "@/lib/wardrobe-guest-demo";
import type { AiExtractedListing } from "@/lib/types";

interface WardrobeProfileImporterProps {
  userName?: string;
  defaultLocation: string;
  contact: string;
  inSpintaCabinet?: boolean;
  /** Anoniminis demo — importas be prisijungimo, registracija tik publikuojant */
  guestMode?: boolean;
  onImportReady?: (drafts: AiExtractedListing[], voiceAnnouncement: string) => void;
  onGuestPreview?: (items: WardrobeProfileImportItem[], drafts: AiExtractedListing[]) => void;
  onToast?: (message: string, type?: "success" | "error" | "info") => void;
}

type LinkedProfileChip = {
  url: string;
  portal: string;
  status: "syncing" | "synced";
  itemCount: number;
};

export function WardrobeProfileImporter({
  userName,
  defaultLocation,
  contact,
  inSpintaCabinet = false,
  guestMode = false,
  onImportReady,
  onGuestPreview,
  onToast,
}: WardrobeProfileImporterProps) {
  const { user, chameleonTheme, openCheckout, refreshListingsCatalog } = useVauto();
  const isGuest = guestMode || isGuestUserId(user.id);
  const access = useMemo(
    () =>
      isGuest
        ? null
        : resolveWardrobeSubscriptionAccess(user, chameleonTheme, inSpintaCabinet),
    [user, chameleonTheme, inSpintaCabinet, isGuest]
  );
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<WardrobeProfileImportItem[]>([]);
  const [linkedProfile, setLinkedProfile] = useState<LinkedProfileChip | null>(null);
  const [valueCard, setValueCard] = useState<{ total: number; count: number } | null>(
    null
  );

  const handleImport = async () => {
    const trimmed = url.trim();
    if (!isWardrobeProfileUrl(trimmed)) {
      onToast?.("Įveskite galiojantį Vinted profilio URL (/member/ arba /invite/).", "info");
      return;
    }
    if (
      !isGuest &&
      access?.active &&
      !canPerformWardrobeProfileImport(user, chameleonTheme, inSpintaCabinet)
    ) {
      onToast?.(
        "Nemokamas spintos importas išnaudotas — Power-User atrakina neribotą importą.",
        "info"
      );
      openCheckout(buildWardrobePowerSubscriptionCheckout());
      return;
    }

    const portal = detectWardrobePortalLabel(trimmed);
    setLinkedProfile({ url: trimmed, portal, status: "syncing", itemCount: 0 });
    setLoading(true);
    try {
      const result = await importWardrobeProfile({
        profileUrl: trimmed,
        userName,
        defaultLocation,
        contact: contact || "+370",
      });
      if (!result?.items.length) {
        setLinkedProfile(null);
        onToast?.("Importas nepavyko — bandykite vėliau.", "info");
        return;
      }
      if (!isGuest && access?.active && !access.canImportUnlimited) {
        incrementWardrobeImportCount(user.id);
      }
      setPreview(result.items);
      setLinkedProfile({
        url: result.profileUrl || trimmed,
        portal,
        status: "synced",
        itemCount: result.items.length,
      });
      setUrl("");

      if (!isGuest) {
        const total =
          result.wardrobeValueTotal ?? computeWardrobeValueTotal(result.items);
        setValueCard({ total, count: result.items.length });
      }

      const drafts = result.items.map((item) =>
        profileItemToDraft(item, contact || "+370", defaultLocation)
      );
      if (isGuest) {
        onGuestPreview?.(result.items, drafts);
      } else {
        await refreshListingsCatalog();
        onImportReady?.([], result.voiceAnnouncement);
      }
      onToast?.(result.voiceAnnouncement, "success");
    } catch {
      setLinkedProfile(null);
      onToast?.("Importas nepavyko — bandykite vėliau.", "error");
    } finally {
      setLoading(false);
    }
  };

  const clearLinkedProfile = () => {
    setLinkedProfile(null);
    setUrl("");
    setPreview([]);
    setValueCard(null);
  };

  return (
    <div className="mb-6 overflow-hidden rounded-3xl border border-fuchsia-500/50 bg-[#131c38] p-4 shadow-lg">
      {valueCard && !isGuest && (
        <WardrobeValueShareCard
          wardrobeValueTotal={valueCard.total}
          itemCount={valueCard.count}
          userName={userName}
          onDismiss={() => setValueCard(null)}
        />
      )}

      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-fuchsia-600 text-white shadow">
          <UploadCloud className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Spintos perkėlimas</p>
          <p className="text-[11px] text-slate-400">
            {isGuest
              ? "Demo režimas — įklijuok profilio URL ir AI paruoš tavo spintą"
              : "Vienas URL — AI sukuria visus VAUTO skelbimus automatiškai"}
            {!isGuest && access?.active && !access.canImportUnlimited && (
              <> · liko {access.importsRemaining} nemokamas importas</>
            )}
          </p>
        </div>
      </div>

      {linkedProfile ? (
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-fuchsia-500/40 bg-[#0a1128] px-3 py-2.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              linkedProfile.status === "syncing"
                ? "bg-amber-500/20 text-amber-200"
                : "bg-fuchsia-600/25 text-fuchsia-100"
            }`}
          >
            {linkedProfile.status === "syncing" ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                {linkedProfile.portal}: Sinchronizuojama…
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3" />
                {linkedProfile.portal}: {linkedProfile.itemCount} prekės
              </>
            )}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
            {shortenProfileUrl(linkedProfile.url)}
          </span>
          <button
            type="button"
            onClick={clearLinkedProfile}
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-white"
            aria-label="Pašalinti susietą profilį"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.vinted.lt/member/... arba /invite/..."
          className="mb-3 w-full rounded-2xl border border-fuchsia-500/60 bg-[#0a1128] px-3 py-2.5 text-sm text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-fuchsia-500/40"
        />
      )}

      {!linkedProfile && (
        <button
          type="button"
          disabled={loading || !url.trim()}
          onClick={() => void handleImport()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-fuchsia-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {isGuest
            ? "Peržiūrėti mano spintą"
            : inSpintaCabinet
              ? "Importuoti iš profilio URL"
              : "Perkelti spintą į VAUTO"}
        </button>
      )}

      {isGuest && preview.length > 0 && <GuestWardrobePreviewGrid items={preview} />}
      {!isGuest && preview.length > 0 && (
        <p className="mt-2 text-center text-[11px] text-fuchsia-300">
          Paruošta {preview.length} skelbimų — patvirtinkite žemiau
        </p>
      )}
    </div>
  );
}
