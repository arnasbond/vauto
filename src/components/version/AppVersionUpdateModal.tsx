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
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-[color-mix(in_srgb,#0a0f18_92%,transparent)] p-6 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Programėlės atnaujinimas"
    >
      <div className="w-full max-w-sm rounded-2xl border border-[var(--vauto-border,#1e293b)] bg-[#0f172a] p-6 text-center text-white shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--vauto-primary,#1b4dff)] text-xl font-extrabold tracking-tight">
          V
        </div>

        <h2 className="font-[family-name:var(--font-outfit)] text-lg font-bold">
          Nauja VAUTO versija
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          Jūsų versija{" "}
          <span className="font-semibold text-white">
            {local?.versionName ?? "?"} ({local?.versionCode ?? "?"})
          </span>{" "}
          atsilieka nuo{" "}
          <span className="font-semibold text-[var(--vauto-primary,#60a5fa)]">
            v{remote.latestVersion}
          </span>
          {sizeLabel ? ` · ${sizeLabel}` : ""}. Atnaujinkite, kad tęstumėte
          saugiai.
        </p>

        {remote.releaseNotesLt ? (
          <p className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-left text-xs leading-relaxed text-slate-400">
            {remote.releaseNotesLt}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleUpdate}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--vauto-primary,#1b4dff)] py-3.5 text-sm font-bold text-white shadow-lg shadow-[rgba(27,77,255,0.35)] transition hover:opacity-95 active:scale-[0.99]"
        >
          <Download className="h-5 w-5" />
          Atsisiųsti v{remote.latestVersion}
          {sizeLabel ? ` (${sizeLabel})` : ""}
        </button>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{hint}</p>
      </div>
    </div>
  );
}
