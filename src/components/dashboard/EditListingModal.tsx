"use client";

import { useEffect, useState } from "react";
import type { Listing } from "@/lib/types";

interface EditListingModalProps {
  listing: Listing | null;
  onClose: () => void;
  onSave: (id: string, patch: { title: string; price: number }) => void;
}

export function EditListingModal({ listing, onClose, onSave }: EditListingModalProps) {
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");

  useEffect(() => {
    if (listing) {
      setTitle(listing.title);
      setPrice(String(listing.price));
    }
  }, [listing]);

  if (!listing) return null;

  return (
    <div className="fixed inset-0 z-[205] flex items-center justify-center bg-black/75 p-4">
      <div className="vauto-auth-modal w-full max-w-sm rounded-3xl p-6">
        <h3 className="mb-4 text-lg font-semibold text-white">Redaguoti skelbimą</h3>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mb-3 w-full rounded-xl bg-white/10 px-4 py-3 text-sm text-white outline-none"
          placeholder="Pavadinimas"
        />
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="mb-4 w-full rounded-xl bg-white/10 px-4 py-3 text-sm text-white outline-none"
          placeholder="Kaina €"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-white/10 py-2.5 text-sm text-slate-300"
          >
            Atšaukti
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(listing.id, { title, price: Number(price) || 0 });
              onClose();
            }}
            className="flex-1 rounded-xl bg-[var(--vauto-teal)] py-2.5 text-sm font-semibold text-white"
          >
            Išsaugoti
          </button>
        </div>
      </div>
    </div>
  );
}
