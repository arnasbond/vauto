"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle,
  MessageSquare,
  Shield,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { useVauto } from "@/context/VautoContext";
import { REPORT_CATEGORIES, URGENCY_META } from "@/lib/reports";
import type { ReportUrgency, SupportReport } from "@/lib/types";

const URGENCY_ORDER: ReportUrgency[] = ["critical", "feedback", "general"];

function ReportRow({
  report,
  onWarn,
  onBan,
  onResolve,
}: {
  report: SupportReport;
  onWarn: () => void;
  onBan: () => void;
  onResolve: () => void;
}) {
  const meta = URGENCY_META[report.urgency];
  const catLabel =
    REPORT_CATEGORIES.find((c) => c.id === report.category)?.label ??
    report.category;

  return (
    <div className="vauto-dashboard-card rounded-2xl p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${meta.className}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
            <span className="text-[10px] text-slate-500">
              {new Date(report.createdAt).toLocaleString("lt-LT")}
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold text-white">{catLabel}</p>
          <p className="text-xs text-slate-400">
            Pranešė: <span className="text-slate-300">{report.reporterName}</span>
          </p>
        </div>
      </div>

      <p className="mb-2 line-clamp-2 text-xs text-slate-400">{report.comment}</p>

      {(report.listingTitle || report.chatPreview) && (
        <div className="mb-3 rounded-lg bg-black/20 px-2.5 py-2 text-[11px] text-slate-500">
          {report.listingTitle && (
            <p className="truncate">📦 {report.listingTitle}</p>
          )}
          {report.chatPreview && (
            <p className="mt-0.5 flex items-start gap-1 truncate">
              <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
              {report.chatPreview}
            </p>
          )}
        </div>
      )}

      {report.status === "open" ? (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={onWarn}
            className="flex items-center gap-1 rounded-lg bg-amber-500/15 px-2.5 py-1.5 text-[10px] font-medium text-amber-300"
          >
            <AlertTriangle className="h-3 w-3" />
            Įspėti vartotoją
          </button>
          <button
            type="button"
            onClick={onBan}
            className="flex items-center gap-1 rounded-lg bg-red-500/15 px-2.5 py-1.5 text-[10px] font-medium text-red-300"
          >
            <Ban className="h-3 w-3" />
            Blokuoti
          </button>
          <button
            type="button"
            onClick={onResolve}
            className="flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-[10px] font-medium text-emerald-300"
          >
            <CheckCircle className="h-3 w-3" />
            Uždaryti / Atmesti
          </button>
        </div>
      ) : (
        <p className="text-[10px] uppercase tracking-wide text-slate-600">
          {report.status === "resolved" ? "Išspręsta" : "Atmesta"}
        </p>
      )}
    </div>
  );
}

export function AdminControlCenter() {
  const {
    reports,
    warnFromReport,
    banFromReport,
    resolveReport,
    logout,
  } = useVauto();
  const [filter, setFilter] = useState<ReportUrgency | "all">("all");

  const openReports = reports.filter((r) => r.status === "open");
  const filtered =
    filter === "all"
      ? openReports
      : openReports.filter((r) => r.urgency === filter);

  const counts = useMemo(
    () => ({
      critical: openReports.filter((r) => r.urgency === "critical").length,
      feedback: openReports.filter((r) => r.urgency === "feedback").length,
      general: openReports.filter((r) => r.urgency === "general").length,
    }),
    [openReports]
  );

  return (
    <DashboardShell>
      <div className="mb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/20">
            <Shield className="h-6 w-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">VAUTO Control Center</h1>
            <p className="text-xs text-slate-400">Moderacija ir palaikymas</p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="mt-3 text-xs text-slate-500 underline"
        >
          Atsijungti
        </button>
      </div>

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
        Aktyvūs pranešimai ({filtered.length})
      </p>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="vauto-dashboard-card rounded-2xl py-12 text-center text-sm text-slate-500">
            Nėra atvirų pranešimų šioje kategorijoje.
          </p>
        ) : (
          filtered.map((r) => (
            <ReportRow
              key={r.id}
              report={r}
              onWarn={() => warnFromReport(r.id)}
              onBan={() => banFromReport(r.id)}
              onResolve={() => resolveReport(r.id, "resolved")}
            />
          ))
        )}
      </div>

      {reports.filter((r) => r.status !== "open").length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-xs text-slate-500">
            Archyvas ({reports.filter((r) => r.status !== "open").length})
          </summary>
          <div className="mt-2 space-y-2 opacity-60">
            {reports
              .filter((r) => r.status !== "open")
              .map((r) => (
                <ReportRow
                  key={r.id}
                  report={r}
                  onWarn={() => {}}
                  onBan={() => {}}
                  onResolve={() => {}}
                />
              ))}
          </div>
        </details>
      )}
    </DashboardShell>
  );
}
