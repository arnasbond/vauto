"use client";

import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { wizardInvalidClass } from "@/lib/listing-field-validation";

export function WizardFooter({
  showBack,
  onBack,
  onNext,
  nextDisabled,
  nextLabel = "Toliau",
  nextClassName,
  children,
}: {
  showBack: boolean;
  onBack?: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
  nextClassName?: string;
  children?: ReactNode;
}) {
  return (
    <div className="nt-wizard-footer mt-6 flex items-center justify-between gap-3">
      {showBack ? (
        <button
          type="button"
          onClick={onBack}
          className="nt-wizard-muted inline-flex items-center gap-1 text-sm font-medium hover:opacity-80"
        >
          <ChevronLeft className="h-4 w-4" />
          Grįžti
        </button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">
        {children}
        <button
          type="button"
          disabled={nextDisabled}
          onClick={onNext}
          className={cn(
            "nt-wizard-next-btn rounded-md px-8 py-3 text-sm font-bold shadow-md disabled:cursor-not-allowed disabled:opacity-40",
            nextClassName
          )}
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}

export function WizardLabel({
  children,
  required,
  htmlFor,
}: {
  children: ReactNode;
  required?: boolean;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="nt-wizard-label mb-1.5 block text-sm font-medium">
      {children}
      {required && <span className="text-red-600"> *</span>}
    </label>
  );
}

export function WizardInput({
  invalid,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      className={cn(
        "nt-wizard-input w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:border-[var(--vauto-primary)] focus:ring-1 focus:ring-[var(--vauto-primary)]",
        wizardInvalidClass(Boolean(invalid)),
        className
      )}
    />
  );
}

export function WizardSelect({
  invalid,
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      {...props}
      className={cn(
        "nt-wizard-input w-full appearance-none rounded-md border px-3 py-2.5 text-sm outline-none focus:border-[var(--vauto-primary)] focus:ring-1 focus:ring-[var(--vauto-primary)]",
        wizardInvalidClass(Boolean(invalid)),
        className
      )}
    >
      {children}
    </select>
  );
}

export function WizardChipRow({
  label,
  required,
  options,
  value,
  onChange,
  invalid,
}: {
  label: string;
  required?: boolean;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  return (
    <div className={cn("mb-4", wizardInvalidClass(Boolean(invalid)))}>
      <WizardLabel required={required}>{label}</WizardLabel>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={cn(
              "nt-wizard-chip shrink-0 rounded-md border px-3 py-2 text-sm font-medium transition",
              value === opt && "nt-wizard-chip-active"
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export function WizardPanel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("nt-wizard-panel rounded-md border p-3", className)}>
      {children}
    </div>
  );
}
