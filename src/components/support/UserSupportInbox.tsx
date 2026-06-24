"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Flag,
  MessageSquare,
  Send,
} from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { REPORT_CATEGORIES } from "@/lib/reports";
import type { ReportMessage, SupportReport } from "@/lib/types";
import { cn } from "@/lib/cn";

function roleStyles(role: ReportMessage["role"]) {
  switch (role) {
    case "admin":
      return "bg-[var(--vauto-teal)]/15 border-[var(--vauto-teal)]/30 ml-4";
    case "system":
      return "bg-slate-500/10 border-slate-500/20";
    case "ai":
      return "bg-violet-500/10 border-violet-500/25 ml-4";
    default:
      return "bg-slate-50 border-slate-200 mr-4";
  }
}

function statusLabel(status: SupportReport["status"]) {
  switch (status) {
    case "resolved":
      return { text: "Išspręsta", className: "text-emerald-400" };
    case "dismissed":
      return { text: "Uždaryta", className: "text-slate-400" };
    default:
      return { text: "Atvira", className: "text-amber-300" };
  }
}

export function UserSupportInbox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supportFromUrl = searchParams.get("support");

  const {
    myReports,
    unreadUserReportCount,
    followUpReport,
    markMyReportRead,
    refreshMyReports,
    reportStreamConnected,
  } = useVauto();

  const [selectedId, setSelectedId] = useState<string | null>(supportFromUrl);
  const [replyText, setReplyText] = useState("");
  const [livePulse, setLivePulse] = useState(false);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (supportFromUrl) setSelectedId(supportFromUrl);
  }, [supportFromUrl]);

  useEffect(() => {
    const pulse = window.setInterval(() => setLivePulse((p) => !p), 2000);
    return () => window.clearInterval(pulse);
  }, []);

  const selected = myReports.find((r) => r.id === selectedId) ?? null;

  const sorted = useMemo(
    () =>
      [...myReports].sort(
        (a, b) =>
          new Date(b.updatedAt ?? b.createdAt).getTime() -
          new Date(a.updatedAt ?? a.createdAt).getTime()
      ),
    [myReports]
  );

  const openReport = useCallback(
    (id: string) => {
      setSelectedId(id);
      markMyReportRead(id);
      router.replace(`/profile/?support=${encodeURIComponent(id)}`, { scroll: false });
    },
    [markMyReportRead, router]
  );

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    router.replace("/profile/", { scroll: false });
  }, [router]);

  const handleFollowUp = () => {
    if (!selected || !replyText.trim()) return;
    followUpReport(selected.id, replyText);
    setReplyText("");
  };

  if (selected) {
    const status = statusLabel(selected.status);
    const category =
      REPORT_CATEGORIES.find((c) => c.id === selected.category)?.label ??
      selected.category;

    return (
      <section className="vauto-dashboard-card rounded-2xl p-4">
        <button
          type="button"
          onClick={closeDetail}
          className="mb-3 flex items-center gap-1 text-xs text-slate-400"
        >
          <ChevronLeft className="h-4 w-4" />
          Atgal į mano pranešimus
        </button>

        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {category}
            </p>
            <h2 className="text-sm font-bold text-slate-900">{selected.listingTitle ?? "Bendras pranešimas"}</h2>
          </div>
          <span className={cn("text-xs font-medium", status.className)}>{status.text}</span>
        </div>

        <div className="mb-4 max-h-72 space-y-2 overflow-y-auto pr-1">
          {(selected.messages ?? []).map((msg) => (
            <div
              key={msg.id}
              className={cn("rounded-xl border p-2.5 text-xs", roleStyles(msg.role))}
            >
              <p className="mb-1 font-semibold text-slate-600">
                {msg.role === "admin" ? "Vauto komanda" : msg.senderName}
                {msg.auto && (
                  <span className="ml-1 text-[10px] text-slate-500">(automatinis)</span>
                )}
              </p>
              <p className="leading-relaxed text-slate-400">{msg.text}</p>
              <p className="mt-1 text-[10px] text-slate-600">
                {new Date(msg.timestamp).toLocaleString("lt-LT")}
              </p>
            </div>
          ))}
        </div>

        {selected.status === "open" && (
          <div className="space-y-2">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={2}
              placeholder="Papildoma informacija ar klausimas…"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-600"
            />
            <button
              type="button"
              onClick={handleFollowUp}
              disabled={!replyText.trim()}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--vauto-teal)] py-2.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              Siųsti papildymą
            </button>
          </div>
        )}

        {selected.status !== "open" && (
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
            Šis pranešimas uždarytas. Jei reikia — sukurkite naują.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="vauto-dashboard-card rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
          <MessageSquare className="h-5 w-5 text-amber-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-slate-900">Mano pranešimai</h2>
          <p className="flex items-center gap-2 text-[11px] text-slate-400">
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                livePulse ? "bg-emerald-400" : "bg-emerald-600"
              )}
            />
            {reportStreamConnected
              ? "Realaus laiko srautas (SSE) aktyvus"
              : "Atsakymai atnaujinami kas 8 s"}
          </p>
        </div>
        {unreadUserReportCount > 0 && (
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
            {unreadUserReportCount}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => void refreshMyReports()}
        className="mb-3 rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] text-slate-900"
      >
        Atnaujinti dabar
      </button>

      {sorted.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500">
          Dar neturite pranešimų. Jei matote problemą — naudokite{" "}
          <Flag className="inline h-3 w-3 text-amber-400" /> mygtuką skelbime ar pokalbyje.
        </p>
      ) : (
        <div className="space-y-2">
          {sorted.map((r) => {
            const cat =
              REPORT_CATEGORIES.find((c) => c.id === r.category)?.label ?? r.category;
            const status = statusLabel(r.status);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => openReport(r.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl bg-slate-50 p-3 text-left transition hover:bg-slate-100",
                  r.unreadByReporter && "ring-1 ring-amber-400/40"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-900">
                    {r.listingTitle ?? cat}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">
                    {r.comment.slice(0, 72)}
                    {r.comment.length > 72 ? "…" : ""}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-600">
                    {new Date(r.updatedAt ?? r.createdAt).toLocaleString("lt-LT")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {r.unreadByReporter && (
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">
                      NAUJAS
                    </span>
                  )}
                  <span className={cn("text-[10px]", status.className)}>{status.text}</span>
                  <ChevronRight className="h-4 w-4 text-slate-600" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-[10px] text-slate-600">
        Leiskite naršyklės pranešimus — gausite žinutę, kai administratorius atsakys.{" "}
        <Link href="/install/" className="text-teal-500 underline">
          Įdiegti programėlę
        </Link>
      </p>
    </section>
  );
}
