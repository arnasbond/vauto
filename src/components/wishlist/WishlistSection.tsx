"use client";

import { Bell, Trash2 } from "lucide-react";
import { useVauto } from "@/context/VautoContext";

export function WishlistSection() {
  const { wishlistQueries, unsubscribeWishlist, isAuthenticated } = useVauto();

  if (!isAuthenticated || wishlistQueries.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl border border-[var(--vauto-border-subtle)] bg-[var(--vauto-card-bg)] p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Bell className="h-4 w-4 text-[var(--vauto-primary)]" />
        <h2 className="text-sm font-bold text-[var(--vauto-text-heading)]">Pageidavimų sąrašas</h2>
      </div>
      <p className="mb-3 text-xs text-[var(--vauto-text-muted)]">
        Gausite pranešimą, kai kas nors įkels atitinkantį skelbimą. Paspaudę
        pranešimą atsidarysite prekės langą.
      </p>
      <ul className="space-y-2">
        {wishlistQueries.map((q) => (
          <li
            key={q}
            className="flex items-center justify-between gap-2 rounded-xl bg-[var(--vauto-surface-muted)] px-3 py-2.5"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-[var(--vauto-body)]">
              {q}
            </span>
            <button
              type="button"
              onClick={() => unsubscribeWishlist(q)}
              className="shrink-0 rounded-lg p-1.5 text-[var(--vauto-subtle)] hover:bg-[var(--ds-danger-soft)] hover:text-[var(--ds-danger)]"
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
