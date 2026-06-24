"use client";

import { AdminGeminiUploadPanel } from "@/components/admin/AdminGeminiUploadPanel";

/** @deprecated Use AdminGeminiUploadPanel */
export function AdminGeminiContextPanel() {
  return (
    <div className="px-4 pt-4">
      <AdminGeminiUploadPanel />
    </div>
  );
}
