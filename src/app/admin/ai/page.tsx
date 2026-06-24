"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  ADMIN_GEMINI_BUILD,
  AdminGeminiUploadPanel,
} from "@/components/admin/AdminGeminiUploadPanel";

export default function AdminAiPage() {
  return (
    <AppShell variant="plain" hideNav>
      <div className="pb-8">
        <Link
          href="/profile/"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Atgal į administratorių
        </Link>
        <AdminGeminiUploadPanel />
        <p className="mt-4 text-center text-[11px] text-slate-400">
          Jei nematote šio bloko programėlėje — atnaujinkite APK iš{" "}
          <a
            href="https://vauto-chi.vercel.app/install/"
            className="text-indigo-600 underline"
          >
            vauto-chi.vercel.app/install
          </a>{" "}
          arba atidarykite naršyklėje. Build: {ADMIN_GEMINI_BUILD}
        </p>
      </div>
    </AppShell>
  );
}
