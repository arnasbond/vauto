"use client";

import { useState } from "react";
import { Flag, X } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { REPORT_CATEGORIES } from "@/lib/reports";
import type { ReportCategory } from "@/lib/types";

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  listingId?: string;
  listingTitle?: string;
  reportedUserId?: string;
  chatId?: string;
  chatPreview?: string;
}

export function ReportModal({
  open,
  onClose,
  listingId,
  listingTitle,
  reportedUserId,
  chatId,
  chatPreview,
}: ReportModalProps) {
  const { submitReport } = useVauto();
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (!open) return null;

  const handleSubmit = () => {
    if (!category) return;
    submitReport({
      category,
      comment: comment.trim() || REPORT_CATEGORIES.find((c) => c.id === category)?.label || "",
      listingId,
      listingTitle,
      chatId,
      reportedUserId,
      chatPreview,
    });
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setCategory(null);
      setComment("");
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center">
      <div className="vauto-light-modal w-full max-w-md rounded-t-3xl p-6 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-slate-900">Pranešti apie pažeidimą</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Uždaryti"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {submitted ? (
          <div className="py-10 text-center">
            <p className="font-semibold text-emerald-700">Pranešimas išsiųstas</p>
            <p className="mt-1 text-sm text-slate-500">Ačiū — peržiūrėsime per 24 val.</p>
          </div>
        ) : (
          <>
            {(listingTitle || chatPreview) && (
              <p className="mb-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {listingTitle && <>Skelbimas: {listingTitle}</>}
                {chatPreview && <>Pokalbis: {chatPreview.slice(0, 80)}…</>}
              </p>
            )}

            <p className="mb-2 text-xs font-medium text-slate-600">Kategorija</p>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {REPORT_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`rounded-xl border p-3 text-left text-xs transition ${
                    category === c.id
                      ? "border-amber-300 bg-amber-50 ring-1 ring-amber-400"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <p className="font-semibold text-slate-900">{c.label}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">{c.description}</p>
                </button>
              ))}
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Papildomas komentaras (neprivaloma)…"
              className="mb-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[var(--vauto-teal)]"
            />

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!category}
              className="w-full rounded-2xl bg-amber-500 py-3.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Siųsti pranešimą
            </button>
          </>
        )}
      </div>
    </div>
  );
}
