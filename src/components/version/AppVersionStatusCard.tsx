"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Globe,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useAppVersion } from "@/context/AppVersionContext";
import { formatApkSize, openAppUpdateDownload } from "@/lib/app-version";
import { cn } from "@/lib/cn";

export function AppVersionStatusCard() {
  const { status, remote, local, error, refresh } = useAppVersion();
  const sizeLabel = formatApkSize(remote?.apkSizeBytes);

  if (status === "loading") {
    return (
      <p className="flex items-center justify-center gap-2 py-3 text-center text-xs text-[var(--vauto-text-muted)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Tikrinama versija…
      </p>
    );
  }

  if (status === "error") {
    return (
      <div className="vauto-alert-warning rounded-xl px-3 py-2.5 text-center">
        <p className="flex items-center justify-center gap-1.5 text-xs font-medium">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
          Versijos patikra nepavyko
        </p>
        <p className="mt-1 text-[10px] text-[var(--vauto-text-muted)]">{error}</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--vauto-primary)] underline"
        >
          <RefreshCw className="h-3 w-3" />
          Bandyti dar kartą
        </button>
      </div>
    );
  }

  if (status === "web" && remote) {
    return (
      <p className="flex items-center justify-center gap-1.5 py-3 text-center text-xs text-[var(--vauto-text-muted)]">
        <Globe className="h-3.5 w-3.5 shrink-0 text-[var(--vauto-primary)]" />
        Web · gamybinė APK v{remote.latestVersion}
        {sizeLabel ? ` (${sizeLabel})` : ""}
      </p>
    );
  }

  if (status === "current" && remote && local) {
    return (
      <p
        className={cn(
          "flex flex-wrap items-center justify-center gap-1.5 py-3 text-center text-xs",
          "text-emerald-600"
        )}
      >
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        Programėlė atnaujinta — v{remote.latestVersion}
        <span className="text-[10px] text-[var(--vauto-text-muted)]">
          · APK {local.versionName} ({local.versionCode})
        </span>
      </p>
    );
  }

  if (status === "outdated_minor" && remote && local) {
    return (
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-center dark:border-sky-900/40 dark:bg-sky-950/30">
        <p className="text-xs text-sky-700 dark:text-sky-300">
          Galima atnaujinti: {local.versionName} → v{remote.latestVersion}
          {sizeLabel ? ` · ${sizeLabel}` : ""}
        </p>
        <button
          type="button"
          onClick={() => void openAppUpdateDownload(remote.downloadUrl)}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[var(--vauto-primary)]"
        >
          <Download className="h-3.5 w-3.5" />
          Atsisiųsti APK
        </button>
      </div>
    );
  }

  if (status === "outdated_major" && remote && local) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-center dark:border-amber-900/40 dark:bg-amber-950/30">
        <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
          Reikalingas APK atnaujinimas: {local.versionName} ({local.versionCode}) →
          v{remote.latestVersion} ({remote.versionCode})
          {sizeLabel ? ` · ${sizeLabel}` : ""}
        </p>
        <button
          type="button"
          onClick={() => void openAppUpdateDownload(remote.downloadUrl)}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[var(--vauto-primary)]"
        >
          <Download className="h-3.5 w-3.5" />
          Atsisiųsti dabar
        </button>
      </div>
    );
  }

  return null;
}
