"use client";

import { AppVersionUpdateModal } from "@/components/version/AppVersionUpdateModal";
import { AppVersionSoftBanner } from "@/components/version/AppVersionSoftBanner";

/** Native shell: blocking major modal + soft minor banner. */
export function AppVersionGuard() {
  return (
    <>
      <AppVersionUpdateModal />
      <AppVersionSoftBanner />
    </>
  );
}
