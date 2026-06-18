"use client";

import { useRouter } from "next/navigation";
import { Camera, Mic, Plus } from "lucide-react";
import { useVauto } from "@/context/VautoContext";

export function ActionButtons() {
  const router = useRouter();
  const { startUploadFlow, startVoiceFlow, sellerStep, requireAuthForListing } =
    useVauto();
  const disabled =
    sellerStep !== "idle" && sellerStep !== "published";

  const goToAdd = () => {
    if (requireAuthForListing("/add")) {
      router.push("/add");
    }
  };

  return (
    <div className="relative mt-2">
      <p className="mb-3 text-center text-sm font-medium text-white/90">
        Pradėti dabar
      </p>

      <div className="relative flex items-center justify-center gap-2">
        {/* Left — Upload */}
        <button
          type="button"
          disabled={disabled}
          onClick={startUploadFlow}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white px-2 py-3 text-[11px] font-semibold text-[var(--vauto-text)] shadow-lg transition hover:bg-gray-50 disabled:opacity-50 sm:text-xs"
        >
          <Camera className="h-4 w-4 shrink-0 text-[var(--vauto-blue)]" />
          <span className="leading-tight">Įkelti Foto/Video</span>
        </button>

        {/* Center FAB — overlaps into white section */}
        <button
          type="button"
          onClick={goToAdd}
          className="fab-glow relative z-10 mx-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white shadow-xl"
          aria-label="Įdėti naują"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--vauto-orange)]">
            <Plus className="h-6 w-6 text-white" strokeWidth={2.5} />
          </span>
        </button>

        {/* Right — Voice */}
        <button
          type="button"
          disabled={disabled}
          onClick={startVoiceFlow}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white px-2 py-3 text-[11px] font-semibold text-[var(--vauto-text)] shadow-lg transition hover:bg-gray-50 disabled:opacity-50 sm:text-xs"
        >
          <Mic className="h-4 w-4 shrink-0 text-[var(--vauto-red)]" />
          <span className="leading-tight">Įrašyti aprašymą</span>
        </button>
      </div>
    </div>
  );
}
