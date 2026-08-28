"use client";

import { useCallback, useMemo, useState } from "react";
import { CheckCheck, Pencil, Trash2, X } from "lucide-react";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { useAuth } from "@/context/AuthContext";
import { wardrobeBulkToDrafts } from "@/lib/agent-wardrobe-bridge";
import { cn } from "@/lib/cn";

/**
 * Mass-publish review surface for wardrobe / multi-item Vision drafts.
 * Scroll target for `scrollToWardrobeBulkReview()` (`#wardrobe-bulk-review`).
 */
export function WardrobeBulkReviewPanel({ className }: { className?: string }) {
  const {
    pendingWardrobeBulkItems,
    stageWardrobeBulkPreview,
    publishBulkClothingListings,
    sellerPreviewImage,
  } = useSellerFlow();
  const { user } = useAuth();
  const [publishing, setPublishing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const items = pendingWardrobeBulkItems;
  const visible = Boolean(items && items.length > 1);

  const total = useMemo(
    () => (items ?? []).reduce((sum, item) => sum + (Number(item.suggestedPrice) || 0), 0),
    [items]
  );

  const updateItemPrice = useCallback(
    (id: string, price: number) => {
      if (!items) return;
      stageWardrobeBulkPreview(
        items.map((item) =>
          item.id === id
            ? { ...item, suggestedPrice: Math.max(1, Math.round(price) || 1) }
            : item
        )
      );
    },
    [items, stageWardrobeBulkPreview]
  );

  const removeItem = useCallback(
    (id: string) => {
      if (!items) return;
      const next = items.filter((item) => item.id !== id);
      stageWardrobeBulkPreview(next.length ? next : []);
      if (editingId === id) setEditingId(null);
    },
    [editingId, items, stageWardrobeBulkPreview]
  );

  const dismiss = useCallback(() => {
    stageWardrobeBulkPreview([]);
    setEditingId(null);
  }, [stageWardrobeBulkPreview]);

  const publishAll = useCallback(async () => {
    if (!items?.length || publishing) return;
    setPublishing(true);
    try {
      const drafts = wardrobeBulkToDrafts(
        items,
        user.phone,
        user.city?.trim() || ""
      ).map((draft, idx) => {
        const cover =
          items[idx]?.imageUrl?.trim() ||
          draft.orderedImageUrls?.[0] ||
          sellerPreviewImage ||
          undefined;
        return cover
          ? { ...draft, orderedImageUrls: [cover] }
          : draft;
      });
      await publishBulkClothingListings(drafts);
    } finally {
      setPublishing(false);
    }
  }, [
    items,
    publishing,
    publishBulkClothingListings,
    sellerPreviewImage,
    user.city,
    user.phone,
  ]);

  if (!visible || !items) return null;

  return (
    <section
      id="wardrobe-bulk-review"
      className={cn(
        "mt-3 rounded-2xl border border-[var(--vauto-primary)]/20 bg-[var(--vauto-card-bg)] p-3 shadow-sm sm:p-4",
        className
      )}
      aria-labelledby="wardrobe-bulk-review-heading"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3
            id="wardrobe-bulk-review-heading"
            className="text-sm font-bold text-[var(--vauto-ink)]"
          >
            Masinis patvirtinimas — {items.length} juodraščiai
          </h3>
          <p className="mt-0.5 text-xs text-[var(--vauto-muted)]">
            Patikrinkite kainas, pašalinkite nereikalingus — tada publikuokite
            visus vienu metu.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg p-1.5 text-[var(--vauto-text-muted)] transition hover:bg-[var(--vauto-surface-muted)] hover:text-[var(--vauto-text-main)]"
          aria-label="Uždaryti masinę peržiūrą"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto overscroll-contain">
        {items.map((item) => {
          const thumb = item.imageUrl?.trim() || sellerPreviewImage || null;
          const isEditing = editingId === item.id;
          return (
            <li
              key={item.id}
              className="flex items-center gap-2.5 rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-surface-muted)] px-2.5 py-2"
            >
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumb}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--vauto-border)]/40 text-[10px] font-semibold text-[var(--vauto-text-muted)]">
                  AI
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--vauto-text-heading)]">
                  {item.title}
                </p>
                <p className="truncate text-[11px] text-[var(--vauto-text-muted)]">
                  {[item.size, item.color, item.brand].filter(Boolean).join(" · ")}
                </p>
                {isEditing ? (
                  <label className="mt-1 flex items-center gap-1 text-xs text-[var(--vauto-text-main)]">
                    €
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={item.suggestedPrice}
                      onChange={(e) =>
                        updateItemPrice(item.id, Number(e.target.value))
                      }
                      onBlur={() => setEditingId(null)}
                      className="w-20 rounded-md border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] px-1.5 py-0.5 text-sm font-semibold text-[var(--vauto-text-main)]"
                      autoFocus
                    />
                  </label>
                ) : (
                  <p className="mt-0.5 text-sm font-bold text-[var(--vauto-text-heading)]">
                    {item.suggestedPrice} €
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() =>
                    setEditingId((prev) => (prev === item.id ? null : item.id))
                  }
                  className="rounded-lg p-1.5 text-[var(--vauto-text-muted)] transition hover:bg-[var(--vauto-card-bg)] hover:text-[var(--vauto-text-heading)]"
                  aria-label={`Redaguoti kainą: ${item.title}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="rounded-lg p-1.5 text-[var(--vauto-text-muted)] transition hover:bg-[var(--vauto-card-bg)] hover:text-red-600"
                  aria-label={`Pašalinti: ${item.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--vauto-border)] pt-3">
        <p className="text-xs text-[var(--vauto-text-muted)]">
          Suma ~ <span className="font-semibold text-[var(--vauto-text-heading)]">{total} €</span>
        </p>
        <button
          type="button"
          disabled={publishing || items.length === 0}
          onClick={() => void publishAll()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--vauto-primary)] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:opacity-95 disabled:opacity-60"
        >
          <CheckCheck className="h-4 w-4" aria-hidden />
          {publishing
            ? "Publikuojama…"
            : `Publikuoti visus (${items.length})`}
        </button>
      </div>
    </section>
  );
}
