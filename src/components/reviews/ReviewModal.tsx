"use client";

import { useState } from "react";
import { Star, X } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { REVIEW_TAG_OPTIONS } from "@/lib/reviews";

interface ReviewModalProps {
  open: boolean;
  onClose: () => void;
  listingId: string;
  listingTitle: string;
  sellerId: string;
}

export function ReviewModal({
  open,
  onClose,
  listingId,
  listingTitle,
  sellerId,
}: ReviewModalProps) {
  const { submitReview, showToast, clearReviewPrompt } = useVauto();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  if (!open) return null;

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag].slice(0, 5)
    );
  };

  const handleSubmit = () => {
    submitReview({
      listingId,
      listingTitle,
      sellerId,
      rating,
      comment,
      tags,
    });
    showToast(
      "Ačiū už atsiliepimą! Gavote 1 nemokamą TOP iškėlimą.",
      "success"
    );
    onClose();
    clearReviewPrompt();
    setRating(5);
    setComment("");
    setTags([]);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="vauto-glass-card w-full max-w-md rounded-3xl p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[var(--vauto-text-heading)]">
              Kaip vertinate patirtį?
            </h2>
            <p className="mt-1 text-sm text-[var(--vauto-text-muted)]">
              {listingTitle}
            </p>
            <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-300">
              Už atsiliepimą — 1 nemokamas TOP skelbimo iškėlimas.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[var(--vauto-text-muted)] hover:bg-[var(--vauto-surface-muted)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 flex justify-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setRating(i + 1)}
              className="p-1"
            >
              <Star
                className={`h-8 w-8 ${
                  i < rating
                    ? "fill-amber-400 text-amber-400"
                    : "text-[var(--vauto-border)]"
                }`}
              />
            </button>
          ))}
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {REVIEW_TAG_OPTIONS.map((tag) => {
            const active = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                  active
                    ? "bg-[var(--flux-teal)] text-[var(--flux-bg)]"
                    : "bg-[var(--vauto-surface-muted)] text-[var(--vauto-text-main)] hover:bg-[var(--vauto-border)]/30"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Trumpas komentaras (nebūtina)..."
          rows={3}
          className="w-full rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-surface-muted)] px-4 py-3 text-sm text-[var(--vauto-text-main)] outline-none placeholder:text-[var(--vauto-text-muted)]"
        />

        <button
          type="button"
          onClick={handleSubmit}
          className="mt-4 w-full rounded-2xl bg-[var(--flux-teal)] py-3.5 text-sm font-bold text-[var(--flux-bg)]"
        >
          Pateikti atsiliepimą
        </button>
      </div>
    </div>
  );
}
