"use client";

import { useState } from "react";
import { Star, X } from "lucide-react";
import { useVauto } from "@/context/VautoContext";

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
  const { submitReview, showToast } = useVauto();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  if (!open) return null;

  const handleSubmit = () => {
    submitReview({ listingId, listingTitle, sellerId, rating, comment });
    showToast("Ačiū už atsiliepimą!", "success");
    onClose();
    setRating(5);
    setComment("");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="vauto-glass-card w-full max-w-md rounded-3xl p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Įvertinkite sandorį</h2>
            <p className="mt-1 text-sm text-[var(--vauto-text-muted)]">
              {listingTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-white/50 hover:bg-white/10"
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
                    : "text-white/20"
                }`}
              />
            </button>
          ))}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Trumpas komentaras (nebūtina)..."
          rows={3}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
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
