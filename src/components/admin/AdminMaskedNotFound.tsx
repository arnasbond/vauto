"use client";

import Link from "next/link";

/**
 * Generic 404 surface for /admin masking.
 * Must not mention admin, Control Center, or authorization — looks like a missing page.
 */
export function AdminMaskedNotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--vauto-bg,#f8fafc)] px-6 pb-24">
      <div className="max-w-sm text-center">
        <p className="text-5xl font-bold tracking-tight text-slate-900">404</p>
        <h1 className="mt-3 text-lg font-semibold text-slate-900">
          Puslapis nerastas
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Šio adreso nėra arba jis buvo perkeltas.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
        >
          Į pradžią
        </Link>
      </div>
    </div>
  );
}
