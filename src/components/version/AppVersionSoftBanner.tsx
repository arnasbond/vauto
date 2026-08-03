"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { useAppVersion } from "@/context/AppVersionContext";
import {
  formatApkSize,
  openAppUpdateDownload,
} from "@/lib/app-version";

const DISMISS_KEY = "vauto_apk_minor_dismiss_code";

/**
 * Non-blocking banner when APK is only one versionCode behind.
 * Major updates stay on AppVersionUpdateModal / native dialog.
 */
export function AppVersionSoftBanner() {
  const { status, remote, local } = useAppVersion();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (status !== "outdated_minor" || !remote) {
      setDismissed(true);
      return;
    }
    try {
      const stored = sessionStorage.getItem(DISMISS_KEY);
      setDismissed(stored === String(remote.versionCode));
    } catch {
      setDismissed(false);
    }
  }, [status, remote]);

  if (status !== "outdated_minor" || !remote || !local || dismissed) return null;

  const sizeLabel = formatApkSize(remote.apkSizeBytes);

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, String(remote.versionCode));
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div
      className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[80] px-3 md:bottom-4"
      role="status"
    >
      <div className="mx-auto flex max-w-lg items-start gap-3 rounded-2xl border border-[var(--vauto-primary)]/30 bg-[var(--vauto-surface,#fff)] p-3 shadow-lg shadow-[rgba(11,18,32,0.12)]">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--vauto-primary)] text-sm font-bold text-white">
          V
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--vauto-text)]">
            Galima atnaujinti į v{remote.latestVersion}
          </p>
          <p className="mt-0.5 text-xs text-[var(--vauto-text-muted)]">
            Dabar {local.versionName} ({local.versionCode})
            {sizeLabel ? ` · APK ${sizeLabel}` : ""}. Rekomenduojame atnaujinti.
          </p>
          <button
            type="button"
            onClick={() => void openAppUpdateDownload(remote.downloadUrl)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[var(--vauto-primary)] px-3 py-1.5 text-xs font-bold text-white"
          >
            <Download className="h-3.5 w-3.5" />
            Atsisiųsti
          </button>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg p-1 text-[var(--vauto-text-muted)] hover:bg-[var(--vauto-surface-muted,#e2e8f0)]"
          aria-label="Uždaryti"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
