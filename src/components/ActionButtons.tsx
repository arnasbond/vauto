"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";

export function ActionButtons() {
  const router = useRouter();
  const { sellerStep, requireAuthForListing } = useVauto();
  const { beginFreshListingChatSession } = useVautoAgent();
  const disabled =
    sellerStep !== "idle" && sellerStep !== "published";

  const goToAdd = () => {
    if (requireAuthForListing("/add/")) {
      beginFreshListingChatSession();
      router.push("/add/");
    }
  };

  return (
    <div className="relative mt-2">
      <p className="mb-3 text-center text-sm font-medium text-white/90">
        Pradėti dabar
      </p>

      <div className="relative flex items-center justify-center">
        <button
          type="button"
          disabled={disabled}
          onClick={goToAdd}
          className="fab-glow relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white shadow-xl disabled:opacity-50"
          aria-label="Įdėti naują skelbimą"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--vauto-orange)]">
            <Plus className="h-6 w-6 text-white" strokeWidth={2.5} />
          </span>
        </button>
      </div>
    </div>
  );
}
