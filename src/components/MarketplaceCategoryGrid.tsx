"use client";

import {
  BriefcaseBusiness,
  Car,
  Home,
  Laptop,
  Shirt,
  Sofa,
  Sparkles,
  Wrench,
} from "lucide-react";
import { useVauto } from "@/context/VautoContext";

const CATEGORIES = [
  { label: "Auto", query: "automobilis ratlankiai padangos", icon: Car },
  { label: "Elektronika", query: "telefonas iphone samsung", icon: Laptop },
  { label: "Namai", query: "baldai sofa stalas", icon: Sofa },
  { label: "Drabužiai", query: "drabužiai batai striukė", icon: Shirt },
  { label: "Paslaugos", query: "meistras remontas paslaugos", icon: Wrench },
  { label: "NT", query: "butas namas nuoma", icon: Home },
  { label: "Darbas", query: "darbas pilnas etatas", icon: BriefcaseBusiness },
  { label: "AI atranda", query: "populiaru šiandien", icon: Sparkles },
] as const;

export function MarketplaceCategoryGrid() {
  const { setSearchQuery } = useVauto();

  return (
    <section className="mb-6 rounded-2xl border border-[#dde5ef] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#1f2937]">Kategorijos</h2>
        <span className="text-[11px] font-semibold text-[#1167b1]">
          Visa Lietuva
        </span>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {CATEGORIES.map((category) => {
          const Icon = category.icon;
          return (
            <button
              key={category.label}
              type="button"
              onClick={() => setSearchQuery(category.query)}
              className="group flex flex-col items-center gap-2 rounded-xl p-2 text-center transition hover:bg-[#eef6ff]"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eef6ff] text-[#1167b1] ring-1 ring-[#d7e9ff] transition group-hover:bg-[#1167b1] group-hover:text-white">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-semibold text-[#374151]">
                {category.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
