"use client";

import Link from "next/link";
import { Building2, FileSpreadsheet, LineChart, X } from "lucide-react";
import {
  BUSINESS_REGISTRATION_PATH,
} from "@/lib/business-portal-access";

interface BusinessAccessGateModalProps {
  open: boolean;
  onClose: () => void;
  /** Prefer plan picker vs full business registration. */
  preferPlanSelect?: boolean;
  onLogin?: () => void;
  isAuthenticated?: boolean;
}

/**
 * Shown when a private/guest user opens Business Portal tools.
 * Does not touch Admin Control Center visibility.
 */
export function BusinessAccessGateModal({
  open,
  onClose,
  preferPlanSelect = false,
  onLogin,
  isAuthenticated = false,
}: BusinessAccessGateModalProps) {
  if (!open) return null;

  const primaryHref = BUSINESS_REGISTRATION_PATH;
  const primaryLabel = preferPlanSelect
    ? "Pasirinkti verslo planą"
    : "Registruoti verslo paskyrą";

  return (
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="business-access-gate-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] p-5 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-[var(--vauto-text-muted)] transition hover:bg-[var(--vauto-surface-muted)] hover:text-[var(--vauto-text-main)]"
          aria-label="Uždaryti"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--vauto-primary)_12%,transparent)] text-[var(--vauto-primary)]">
          <Building2 className="h-6 w-6" aria-hidden />
        </div>

        <h2
          id="business-access-gate-title"
          className="mt-4 font-[family-name:var(--font-outfit)] text-xl font-bold tracking-tight text-[var(--vauto-text-heading)]"
        >
          Verslo portalas verslo paskyroms
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--vauto-text-muted)]">
          Masinis CSV/XML skelbimų įkėlimas, verslo analitika, feed sinchronizacija
          ir sąskaitų valdymas skirti registruotoms verslo paskyroms su aktyviu
          verslo planu.
        </p>

        <ul className="mt-4 space-y-2.5 text-left text-sm text-[var(--vauto-text-main)]">
          <li className="flex items-start gap-2.5">
            <FileSpreadsheet
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--vauto-primary)]"
              aria-hidden
            />
            <span>Masinis skelbimų įkėlimas (CSV / XML feed)</span>
          </li>
          <li className="flex items-start gap-2.5">
            <LineChart
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--vauto-primary)]"
              aria-hidden
            />
            <span>Verslo analitika, planai ir sąskaitos</span>
          </li>
        </ul>

        <div className="mt-6 flex flex-col gap-2.5">
          {isAuthenticated ? (
            <Link
              href={primaryHref}
              onClick={onClose}
              className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--vauto-primary)] px-4 py-3 text-sm font-bold text-[var(--vauto-primary-contrast,#fff)] transition hover:brightness-110"
            >
              {primaryLabel}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                onClose();
                onLogin?.();
              }}
              className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--vauto-primary)] px-4 py-3 text-sm font-bold text-[var(--vauto-primary-contrast,#fff)] transition hover:brightness-110"
            >
              Prisijungti ir registruoti verslą
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex w-full items-center justify-center rounded-xl border border-[var(--vauto-border)] px-4 py-2.5 text-sm font-semibold text-[var(--vauto-text-muted)] transition hover:bg-[var(--vauto-surface-muted)]"
          >
            Likti asmeninėje paskyroje
          </button>
        </div>
      </div>
    </div>
  );
}
