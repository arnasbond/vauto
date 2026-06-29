"use client";



import Link from "next/link";

import { useMemo } from "react";

import { Check, LayoutGrid, Sparkles } from "lucide-react";

import { useVauto } from "@/context/VautoContext";

import { isWardrobeChameleonActive } from "@/lib/wardrobe-cabinet-mode";



export function ProfileSpintaSwitch() {

  const {

    activateWardrobeSpinta,

    wardrobeSpintaForced,

    chameleonTheme,

    detectedAdaptiveKey,

    searchQuery,

    listings,

  } = useVauto();



  const spintaActive = useMemo(

    () =>

      wardrobeSpintaForced ||

      isWardrobeChameleonActive({

        chameleonTheme,

        detectedAdaptiveKey,

        searchQuery,

        listings,

        spintaForced: wardrobeSpintaForced,

      }),

    [

      wardrobeSpintaForced,

      chameleonTheme,

      detectedAdaptiveKey,

      searchQuery,

      listings,

    ]

  );



  const handleActivate = () => {
    activateWardrobeSpinta();
  };



  return (

    <div className="vauto-dashboard-card mb-4 overflow-hidden rounded-2xl border border-fuchsia-200/70 bg-gradient-to-br from-fuchsia-50 via-white to-violet-50 p-4">

      <div className="flex items-start gap-3">

        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-600 text-white shadow-md">

          <LayoutGrid className="h-5 w-5" />

        </span>

        <div className="min-w-0 flex-1">

          <p className="text-sm font-semibold text-slate-900">Mano asortimentas</p>

          <p className="mt-0.5 text-xs text-slate-500">

            Kelių portalų sinchronizacija, AI importas ir skelbimų valdymas vienoje vietoje.

          </p>

          {spintaActive ? (

            <Link

              href="/fashion/mine/"

              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-fuchsia-300 bg-white py-2.5 text-sm font-semibold text-fuchsia-700 transition hover:bg-fuchsia-50"

            >

              <Check className="h-4 w-4" />

              Asortimentas aktyvus — atidaryti kabinę

            </Link>

          ) : (

            <button

              type="button"

              onClick={handleActivate}

              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-fuchsia-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-fuchsia-700"

            >

              <Sparkles className="h-4 w-4" />

              Atidaryti asortimentą

            </button>

          )}

        </div>

      </div>

    </div>

  );

}

