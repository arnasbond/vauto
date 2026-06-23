"use client";

import { Bell, Trash2 } from "lucide-react";
import { useVauto } from "@/context/VautoContext";

export function WishlistSection() {
  const { wishlistQueries, unsubscribeWishlist, isAuthenticated } = useVauto();

  if (!isAuthenticated || wishlistQueries.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl border border-[#dde5ef] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Bell className="h-4 w-4 text-[#1167b1]" />
        <h2 className="text-sm font-bold text-[#111827]">Pageidavimų sąrašas</h2>
      </div>
      <p className="mb-3 text-xs text-[#6b7280]">
        Gausite pranešimą, kai kas nors įkels atitinkantį skelbimą. Paspaudę
        pranešimą atsidarysite prekės langą.
      </p>
      <ul className="space-y-2">
        {wishlistQueries.map((q) => (
          <li
            key={q}
            className="flex items-center justify-between gap-2 rounded-xl bg-[#f9fafb] px-3 py-2.5"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-[#374151]">
              {q}
            </span>
            <button
              type="button"
              onClick={() => unsubscribeWishlist(q)}
              className="shrink-0 rounded-lg p-1.5 text-[#9ca3af] hover:bg-[#fee2e2] hover:text-[#ef4444]"
              aria-label={`Pašalinti ${q}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
