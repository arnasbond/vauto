"use client";

import { Download } from "lucide-react";
import {
  DEFAULT_INSTALL_HINT_LT,
  formatApkSize,
  openAppUpdateDownload,
} from "@/lib/app-version";
import { useAppVersion } from "@/context/AppVersionContext";

/**
 * Blocking modal — only for major / forced APK updates.
 * Minor drift uses AppVersionSoftBanner (non-blocking).
 */
export function AppVersionUpdateModal() {
  const { status, remote, local } = useAppVersion();

  if (status !== "outdated_major" || !remote) return null;

  const sizeLabel = formatApkSize(remote.apkSizeBytes);
  const hint = remote.installHintLt || DEFAULT_INSTALL_HINT_LT;

  const handleUpdate = () => {
    void openAppUpdateDownload(remote.downloadUrl);
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-6 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Programėlės atnaujinimas"
    >
      <div className="w-full max-w-sm rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] p-6 text-center text-[var(--vauto-text-main)] shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--vauto-primary)] text-xl font-extrabold tracking-tight text-[var(--vauto-primary-contrast)]">
          V
        </div>

        <h2 className="font-[family-name:var(--font-outfit)] text-lg font-bold text-[var(--vauto-text-heading)]">
          Nauja VAUTO versija
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-[var(--vauto-text-muted)]">
          Jūsų versija{" "}
          <span className="font-semibold text-[var(--vauto-text-main)]">
            {local?.versionName ?? "?"} ({local?.versionCode ?? "?"})
          </span>{" "}
          atsilieka nuo{" "}
          <span className="font-semibold text-[var(--vauto-primary)]">
            v{remote.latestVersion}
          </span>
          {sizeLabel ? ` · ${sizeLabel}` : ""}. Atnaujinkite, kad tęstumėte
          saugiai.
        </p>

        {remote.releaseNotesLt ? (
          <p className="mt-3 rounded-xl bg-[var(--vauto-surface-muted)] px-3 py-2 text-left text-xs leading-relaxed text-[var(--vauto-text-muted)]">
            {remote.releaseNotesLt}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleUpdate}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--vauto-primary)] py-3.5 text-sm font-bold text-[var(--vauto-primary-contrast)] shadow-lg shadow-[rgba(27,77,255,0.25)] transition hover:opacity-95 active:scale-[0.99]"
        >
          <Download className="h-5 w-5" />
          Atsisiųsti v{remote.latestVersion}
          {sizeLabel ? ` (${sizeLabel})` : ""}
        </button>

        <p className="mt-3 text-[11px] leading-relaxed text-[var(--vauto-text-muted)]">
          {hint}
        </p>
      </div>
    </div>
  );
}
