"use client";

import { ScanFace } from "lucide-react";
import type { MagicMirrorFit } from "@/lib/magic-mirror";

export function MagicMirrorChatBanner({ fit }: { fit: MagicMirrorFit }) {
  return (
    <div className="mx-2 my-2 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-sky-50 p-3">
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-indigo-600 shadow-sm">
          <ScanFace className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">
            Magic Mirror · {fit.fitScore}% atitikimas
          </p>
          <p className="mt-1 text-xs leading-relaxed text-indigo-950">{fit.recommendation}</p>
        </div>
      </div>
    </div>
  );
}
