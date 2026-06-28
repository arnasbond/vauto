"use client";

import { AppVersionUpdateModal } from "@/components/version/AppVersionUpdateModal";

/** Mounts blocking update modal when native APK is behind version-config.json. */
export function AppVersionGuard() {
  return <AppVersionUpdateModal />;
}
