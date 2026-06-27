"use client";

import { Shirt, Sparkles } from "lucide-react";
import { useVauto } from "@/context/VautoContext";

export function ProfileSpintaSwitch() {
  const { activateWardrobeSpinta } = useVauto();

  const handleActivate = () => {
    activateWardrobeSpinta();
    window.location.assign("/profile/?spinta=1");
  };

  return (
    <div className="vauto-dashboard-card mb-4 overflow-hidden rounded-2xl border border-fuchsia-200/70 bg-gradient-to-br from-fuchsia-50 via-white to-violet-50 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-600 text-white shadow-md">
          <Shirt className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">VAUTO Spinta</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Mados režimas su AI importu, Mano Spinta tinkleliu ir fuchsia aplinka.
          </p>
          <button
            type="button"
            onClick={handleActivate}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-fuchsia-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-fuchsia-700"
          >
            <Sparkles className="h-4 w-4" />
            Persijungti į VAUTO Spintą
          </button>
        </div>
      </div>
    </div>
  );
}
