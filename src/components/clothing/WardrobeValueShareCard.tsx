"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Share2, Sparkles, X } from "lucide-react";
import {
  buildWardrobeValueShareCopy,
  type WardrobeValueShareCopy,
} from "@/lib/wardrobe-value-share";

interface WardrobeValueShareCardProps {
  wardrobeValueTotal: number;
  itemCount: number;
  userName?: string;
  onDismiss?: () => void;
}

function encode(text: string): string {
  return encodeURIComponent(text);
}

export function WardrobeValueShareCard({
  wardrobeValueTotal,
  itemCount,
  userName,
  onDismiss,
}: WardrobeValueShareCardProps) {
  const [copied, setCopied] = useState<"facebook" | "instagram" | null>(null);
  const copy = useMemo<WardrobeValueShareCopy>(
    () =>
      buildWardrobeValueShareCopy({
        wardrobeValueTotal,
        itemCount,
        userName,
      }),
    [wardrobeValueTotal, itemCount, userName]
  );

  const shareFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encode(copy.url)}&quote=${encode(copy.facebook)}`;
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=520");
  };

  const copyText = async (platform: "facebook" | "instagram", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(platform);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative mb-4 overflow-hidden rounded-3xl border border-fuchsia-400/40 bg-gradient-to-br from-[#1a1040] via-[#131c38] to-[#0a2840] p-5 shadow-xl shadow-fuchsia-900/20">
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
          aria-label="Uždaryti"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-fuchsia-600/30 text-fuchsia-200 ring-1 ring-fuchsia-400/30">
          <Sparkles className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fuchsia-300/80">
            Spintos vertė
          </p>
          <p className="text-2xl font-bold text-white">
            {wardrobeValueTotal.toFixed(0)} €
          </p>
        </div>
      </div>

      <p className="mb-4 text-sm leading-relaxed text-slate-300">
        Tavo spintos vertė:{" "}
        <span className="font-semibold text-fuchsia-200">
          {wardrobeValueTotal.toFixed(0)} €
        </span>
        ! VAUTO AI pasiruošęs ją išlaisvinti — {itemCount} prek
        {itemCount === 1 ? "ė" : "ės"} jau paruoštos.
      </p>

      <p className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <Share2 className="h-3.5 w-3.5" />
        Pasidalinti (Facebook / Instagram)
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={shareFacebook}
          className="rounded-xl border border-[#1877f2]/30 bg-[#1877f2]/15 px-3 py-2.5 text-left text-xs font-semibold text-[#6eb0ff] transition hover:bg-[#1877f2]/25"
        >
          Facebook — dalintis
        </button>
        <button
          type="button"
          onClick={() => void copyText("instagram", copy.instagram)}
          className="rounded-xl border border-[#e1306c]/25 bg-[#e1306c]/15 px-3 py-2.5 text-left text-xs font-semibold text-[#f472b6] transition hover:bg-[#e1306c]/25"
        >
          {copied === "instagram" ? (
            <span className="flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> Nukopijuota
            </span>
          ) : (
            "Instagram — kopijuoti tekstą"
          )}
        </button>
      </div>

      <div className="mt-3 rounded-xl bg-black/25 p-3 text-[11px] leading-relaxed text-slate-400">
        <p>{copy.instagram}</p>
        <button
          type="button"
          onClick={() => void copyText("facebook", copy.facebook)}
          className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-fuchsia-300"
        >
          {copied === "facebook" ? (
            <>
              <Check className="h-3 w-3" /> Nukopijuota
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Kopijuoti Facebook tekstą
            </>
          )}
        </button>
      </div>
    </div>
  );
}
