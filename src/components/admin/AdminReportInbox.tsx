"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  Bot,
  CheckCircle,
  ChevronLeft,
  Mail,
  MessageSquare,
  Phone,
  Send,
  Shield,
  Sparkles,
  User,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { AiSettingsCard } from "@/components/AiSettingsCard";
import { useVauto } from "@/context/VautoContext";
import { analyzeReportText } from "@/lib/admin-report-ai";
import { REPORT_CATEGORIES, URGENCY_META } from "@/lib/reports";
import { listingPath } from "@/lib/seo";
import type { Listing, ReportMessage, ReportUrgency, SupportReport } from "@/lib/types";
import { cn } from "@/lib/cn";

const URGENCY_ORDER: ReportUrgency[] = ["critical", "feedback", "general"];

function roleStyles(role: ReportMessage["role"]) {
  switch (role) {
    case "admin":
      return "bg-[var(--vauto-teal)]/15 border-[var(--vauto-teal)]/30 ml-6";
    case "system":
      return "bg-slate-500/10 border-slate-500/20";
    case "ai":
      return "bg-violet-500/10 border-violet-500/25";
    default:
      return "bg-white/5 border-white/10 mr-6";
  }
}

export function AdminReportInbox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportFromUrl = searchParams.get("report");

  const {
    reports,
    warnFromReport,
    banFromReport,
    resolveReport,
    replyToReport,
    markReportRead,
    refreshReports,
    unreadAdminCount,
    reportStreamConnected,
    logout,
    findListing,
  } = useVauto();

  const [filter, setFilter] = useState<ReportUrgency | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(reportFromUrl);
  const [replyText, setReplyText] = useState("");
  const [livePulse, setLivePulse] = useState(false);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (reportFromUrl) setSelectedId(reportFromUrl);
  }, [reportFromUrl]);

  useEffect(() => {
    const pulse = window.setInterval(() => setLivePulse((p) => !p), 2000);
    return () => window.clearInterval(pulse);
  }, []);

  const openReports = reports.filter((r) => r.status === "open");
  const filtered =
    filter === "all"
      ? openReports
      : openReports.filter((r) => r.urgency === filter);

  const selected = reports.find((r) => r.id === selectedId) ?? null;

  const counts = useMemo(
    () => ({
      critical: openReports.filter((r) => r.urgency === "critical").length,
      feedback: openReports.filter((r) => r.urgency === "feedback").length,
      general: openReports.filter((r) => r.urgency === "general").length,
    }),
    [openReports]
  );

  const openReport = useCallback(
    (id: string) => {
      setSelectedId(id);
      markReportRead(id);
      router.replace(`/profile/?report=${encodeURIComponent(id)}`, { scroll: false });
    },
    [markReportRead, router]
  );

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    router.replace("/profile/", { scroll: false });
  }, [router]);

  const ai = selected
    ? analyzeReportText(selected.comment, selected.category)
    : null;

  const handleSendReply = (text?: string, auto = false) => {
    if (!selected) return;
    const body = (text ?? replyText).trim();
    if (!body) return;
    replyToReport(selected.id, body, { auto });
    setReplyText("");
  };

  return (
    <DashboardShell>
      <div className="mb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/20">
            <Shield className="h-6 w-6 text-red-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white">Administratoriaus kabinetas</h1>
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <span
                className={cn(
                  "inline-block h-2 w-2 rounded-full",
                  livePulse ? "bg-emerald-400" : "bg-emerald-600"
                )}
              />
              {reportStreamConnected
                ? "Realaus laiko srautas (SSE) aktyvus"
                : "Realaus laiko pranešimai · atsarginis polling"}
            </p>
          </div>
          {unreadAdminCount > 0 && (
            <span className="rounded-full bg-red-500 px-2.5 py-1 text-xs font-bold text-white">
              {unreadAdminCount} nauji
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refreshReports()}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white"
          >
            Atnaujinti dabar
          </button>
          <button type="button" onClick={logout} className="text-xs text-slate-500 underline">
            Atsijungti
          </button>
        </div>
      </div>

      {!selected ? (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2">
            {URGENCY_ORDER.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setFilter(filter === u ? "all" : u)}
                className={`rounded-xl p-2.5 text-center transition ${
                  filter === u ? URGENCY_META[u].className : "bg-white/5"
                }`}
              >
                <p className="text-lg font-bold text-white">{counts[u]}</p>
                <p className="text-[9px] uppercase tracking-wide text-slate-400">
                  {URGENCY_META[u].label}
                </p>
              </button>
            ))}
          </div>

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Pranešimai ({filtered.length})
          </p>

          <div className="space-y-2">
            {filtered.length === 0 ? (
              <p className="vauto-dashboard-card rounded-2xl py-12 text-center text-sm text-slate-500">
                Nėra atvirų pranešimų.
              </p>
            ) : (
              filtered.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => openReport(r.id)}
                  className={cn(
                    "vauto-dashboard-card w-full rounded-2xl p-3 text-left transition hover:bg-white/[0.07]",
                    r.unreadByAdmin && "ring-1 ring-red-400/40"
                  )}
                >
                  <ReportListSummary report={r} />
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={closeDetail}
            className="flex items-center gap-1 text-xs text-slate-400"
          >
            <ChevronLeft className="h-4 w-4" />
            Atgal į sąrašą
          </button>

          <ReportDetailHeader report={selected} />

          <ContactCard report={selected} />

          {(selected.listingTitle || selected.chatPreview) && (
            <ContextCard report={selected} findListing={findListing} />
          )}

          {ai && (
            <div className="vauto-dashboard-card rounded-2xl p-4">
              <div className="mb-2 flex items-center gap-2">
                <Bot className="h-4 w-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-white">AI pagalba administratoriui</h3>
              </div>
              <p className="text-xs leading-relaxed text-slate-400">{ai.summary}</p>
              <p className="mt-2 text-[11px] text-slate-500">{ai.urgencyNote}</p>
              <button
                type="button"
                onClick={() => {
                  setReplyText(ai.suggestedReply);
                }}
                className="mt-3 flex items-center gap-1.5 rounded-lg bg-violet-500/15 px-3 py-2 text-xs font-medium text-violet-200"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Naudoti AI siūlomą atsakymą
              </button>
            </div>
          )}

          <div className="vauto-dashboard-card rounded-2xl p-4">
            <h3 className="mb-3 text-sm font-semibold text-white">Pokalbio gija</h3>
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {(selected.messages ?? []).map((msg) => (
                <div
                  key={msg.id}
                  className={cn("rounded-xl border p-2.5 text-xs", roleStyles(msg.role))}
                >
                  <p className="mb-1 font-semibold text-slate-300">
                    {msg.senderName}
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
              <div className="mt-4 space-y-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={3}
                  placeholder="Atsakymas vartotojui toje pačioje gijoje…"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-slate-600"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleSendReply()}
                    disabled={!replyText.trim()}
                    className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-[var(--vauto-teal)] py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Atsakyti
                  </button>
                  {selected.aiSuggestedReply && (
                    <button
                      type="button"
                      onClick={() => handleSendReply(selected.aiSuggestedReply, true)}
                      className="rounded-xl bg-violet-500/20 px-3 py-2.5 text-xs font-medium text-violet-200"
                    >
                      Auto atsakymas
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {selected.status === "open" && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => warnFromReport(selected.id)}
                className="flex items-center gap-1 rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-medium text-amber-300"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Įspėti
              </button>
              <button
                type="button"
                onClick={() => banFromReport(selected.id)}
                className="flex items-center gap-1 rounded-lg bg-red-500/15 px-3 py-2 text-xs font-medium text-red-300"
              >
                <Ban className="h-3.5 w-3.5" />
                Blokuoti
              </button>
              <button
                type="button"
                onClick={() => {
                  resolveReport(selected.id, "resolved");
                  closeDetail();
                }}
                className="flex items-center gap-1 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-300"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Uždaryti
              </button>
            </div>
          )}
        </div>
      )}

      {!selected && reports.filter((r) => r.status !== "open").length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-xs text-slate-500">
            Archyvas ({reports.filter((r) => r.status !== "open").length})
          </summary>
          <div className="mt-2 space-y-2 opacity-70">
            {reports
              .filter((r) => r.status !== "open")
              .map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => openReport(r.id)}
                  className="vauto-dashboard-card w-full rounded-2xl p-3 text-left"
                >
                  <ReportListSummary report={r} />
                </button>
              ))}
          </div>
        </details>
      )}

      <div className="mt-8">
        <AiSettingsCard />
      </div>
    </DashboardShell>
  );
}

function ReportListSummary({ report }: { report: SupportReport }) {
  const meta = URGENCY_META[report.urgency];
  const catLabel =
    REPORT_CATEGORIES.find((c) => c.id === report.category)?.label ?? report.category;
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${meta.className}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
        {report.unreadByAdmin && (
          <span className="text-[10px] font-bold text-red-400">NAUJAS</span>
        )}
      </div>
      <p className="mt-1 text-sm font-semibold text-white">{catLabel}</p>
      <p className="text-xs text-slate-400">{report.reporterName}</p>
      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{report.comment}</p>
    </>
  );
}

function ReportDetailHeader({ report }: { report: SupportReport }) {
  const catLabel =
    REPORT_CATEGORIES.find((c) => c.id === report.category)?.label ?? report.category;
  const meta = URGENCY_META[report.urgency];
  return (
    <div className="vauto-dashboard-card rounded-2xl p-4">
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${meta.className}`}
      >
        {meta.label}
      </span>
      <h2 className="mt-2 text-lg font-bold text-white">{catLabel}</h2>
      <p className="text-xs text-slate-500">
        {new Date(report.createdAt).toLocaleString("lt-LT")}
      </p>
    </div>
  );
}

function ContactCard({ report }: { report: SupportReport }) {
  return (
    <div className="vauto-dashboard-card rounded-2xl p-4">
      <div className="mb-2 flex items-center gap-2">
        <User className="h-4 w-4 text-[var(--vauto-teal)]" />
        <h3 className="text-sm font-semibold text-white">Vartotojas ir kontaktai</h3>
      </div>
      <p className="text-sm font-medium text-white">{report.reporterName}</p>
      <p className="text-[11px] text-slate-500">ID: {report.reporterId}</p>
      <div className="mt-3 space-y-1.5 text-xs">
        {report.reporterPhone && (
          <a
            href={`tel:${report.reporterPhone}`}
            className="flex items-center gap-2 text-[var(--vauto-teal)]"
          >
            <Phone className="h-3.5 w-3.5" />
            {report.reporterPhone}
          </a>
        )}
        {report.reporterEmail && (
          <a
            href={`mailto:${report.reporterEmail}`}
            className="flex items-center gap-2 text-sky-300"
          >
            <Mail className="h-3.5 w-3.5" />
            {report.reporterEmail}
          </a>
        )}
        {!report.reporterPhone && !report.reporterEmail && (
          <p className="text-slate-500">Kontaktai neįrašyti — naudokite atsakymą gijoje.</p>
        )}
      </div>
    </div>
  );
}

function ContextCard({
  report,
  findListing,
}: {
  report: SupportReport;
  findListing: (id: string) => Listing | undefined;
}) {
  const listing = report.listingId ? findListing(report.listingId) : undefined;
  return (
    <div className="vauto-dashboard-card rounded-2xl p-4 text-xs text-slate-400">
      {report.listingTitle && (
        <p>
          Skelbimas:{" "}
          {listing ? (
            <Link href={listingPath(listing)} className="text-[var(--vauto-teal)]">
              {report.listingTitle}
            </Link>
          ) : (
            report.listingTitle
          )}
        </p>
      )}
      {report.chatPreview && (
        <p className="mt-1 flex items-start gap-1">
          <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {report.chatPreview}
        </p>
      )}
    </div>
  );
}
