"use client";

import { Loader2, Sparkles, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";
import { useVauto } from "@/context/VautoContext";
import {
  importWardrobeProfile,
  isWardrobeProfileUrl,
  profileItemToDraft,
  type WardrobeProfileImportItem,
} from "@/lib/wardrobe-profile-importer";
import { incrementWardrobeImportCount, buildWardrobePowerSubscriptionCheckout } from "@/lib/monetization-wardrobe";
import {
  canPerformWardrobeProfileImport,
  resolveWardrobeSubscriptionAccess,
} from "@/lib/SubscriptionGuard";
import type { AiExtractedListing } from "@/lib/types";

interface WardrobeProfileImporterProps {
  userName?: string;
  defaultLocation: string;
  contact: string;
  inSpintaCabinet?: boolean;
  onImportReady: (drafts: AiExtractedListing[], voiceAnnouncement: string) => void;
  onToast?: (message: string, type?: "success" | "error" | "info") => void;
}

export function WardrobeProfileImporter({
  userName,
  defaultLocation,
  contact,
  inSpintaCabinet = false,
  onImportReady,
  onToast,
}: WardrobeProfileImporterProps) {
  const { user, chameleonTheme, openCheckout } = useVauto();
  const access = useMemo(
    () => resolveWardrobeSubscriptionAccess(user, chameleonTheme, inSpintaCabinet),
    [user, chameleonTheme, inSpintaCabinet]
  );
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<WardrobeProfileImportItem[]>([]);

  const handleImport = async () => {
    const trimmed = url.trim();
    if (!isWardrobeProfileUrl(trimmed)) {
      onToast?.("Įveskite galiojantį profilio URL (member puslapį).", "info");
      return;
    }
    if (access.active && !canPerformWardrobeProfileImport(user, chameleonTheme, inSpintaCabinet)) {
      onToast?.(
        "Nemokamas spintos importas išnaudotas — Power-User atrakina neribotą importą.",
        "info"
      );
      openCheckout(buildWardrobePowerSubscriptionCheckout());
      return;
    }
    setLoading(true);
    try {
      const result = await importWardrobeProfile({
        profileUrl: trimmed,
        userName,
        defaultLocation,
        contact,
      });
      if (!result?.items.length) {
        onToast?.("Importas nepavyko — bandykite vėliau.", "info");
        return;
      }
      if (access.active && !access.canImportUnlimited) {
        incrementWardrobeImportCount(user.id);
      }
      setPreview(result.items);
      const drafts = result.items.map((item) =>
        profileItemToDraft(item, contact, defaultLocation)
      );
      onImportReady(drafts, result.voiceAnnouncement);
      onToast?.(result.voiceAnnouncement, "success");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-6 overflow-hidden rounded-3xl border border-fuchsia-200/80 bg-gradient-to-br from-fuchsia-50 via-white to-violet-50 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-fuchsia-600 text-white shadow">
          <UploadCloud className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Spintos perkėlimas</p>
          <p className="text-[11px] text-slate-500">
            Vienas URL — AI sukuria visus VAUTO skelbimus automatiškai
            {access.active && !access.canImportUnlimited && (
              <> · liko {access.importsRemaining} nemokamas importas</>
            )}
          </p>
        </div>
      </div>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…/member/tavo-profilis"
        className="mb-3 w-full rounded-2xl border border-fuchsia-100 bg-white px-3 py-2.5 text-sm outline-none ring-fuchsia-200 focus:ring-2"
      />
      <button
        type="button"
        disabled={loading || !url.trim()}
        onClick={() => void handleImport()}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-fuchsia-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        Perkelti spintą į VAUTO
      </button>
      {preview.length > 0 && (
        <p className="mt-2 text-center text-[11px] text-fuchsia-700">
          Paruošta {preview.length} skelbimų — patvirtinkite žemiau
        </p>
      )}
    </div>
  );
}
