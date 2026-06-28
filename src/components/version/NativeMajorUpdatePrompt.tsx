"use client";

import { useEffect, useRef } from "react";
import { useAppVersion } from "@/context/AppVersionContext";
import { promptNativeMajorUpdate } from "@/lib/app-version";

/**
 * When native APK versionCode lags remote by >1, triggers Android AlertDialog + APK download.
 * Falls back to web modal via AppVersionUpdateModal when bridge is unavailable.
 */
export function NativeMajorUpdatePrompt() {
  const { status, remote } = useAppVersion();
  const promptedRef = useRef(false);

  useEffect(() => {
    if (status !== "outdated_major" || !remote) return;
    if (promptedRef.current) return;
    promptedRef.current = true;
    promptNativeMajorUpdate(remote.latestVersion, remote.downloadUrl);
  }, [status, remote]);

  return null;
}
