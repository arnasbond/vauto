"use client";

import { AlertTriangle, CheckCircle2, Globe, Loader2, RefreshCw } from "lucide-react";
import { useAppVersion } from "@/context/AppVersionContext";
import { cn } from "@/lib/cn";

export function AppVersionStatusCard() {
  const { status, remote, local, error, refresh } = useAppVersion();

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
        Web versija v{remote.latestVersion} (gamybinė)
      </p>
    );
  }

  if (status === "current" && remote && local) {
    return (
      <p
        className={cn(
          "flex items-center justify-center gap-1.5 py-3 text-center text-xs",
          "text-emerald-600"
        )}
      >
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        Aplikacija atitinka Web (v{remote.latestVersion}) — versija naujausia
        <span className="text-[10px] text-[var(--vauto-text-muted)]">
          · APK {local.versionName} ({local.versionCode})
        </span>
      </p>
    );
  }

  if (status === "outdated_minor" && remote && local) {
    return (
      <p className="py-2 text-center text-xs text-sky-600">
        Web atnaujinta (v{remote.latestVersion}). Patraukite ekraną žemyn, kad sinchronizuotumėte
        APK turinį — {local.versionName} ({local.versionCode})
      </p>
    );
  }

  if (status === "outdated_major" && remote && local) {
    return (
      <p className="py-2 text-center text-xs text-fuchsia-600">
        Reikalingas svarbus APK atnaujinimas: {local.versionName} ({local.versionCode}) → v
        {remote.latestVersion} ({remote.versionCode})
      </p>
    );
  }

  return null;
}
