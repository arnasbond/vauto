"use client";

import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";
import { Search } from "lucide-react";
import { cn } from "../utils";

const FIELD_BASE =
  "ds-focusable w-full rounded-[var(--ds-radius-control)] border border-[var(--ds-border-strong)] bg-[var(--ds-surface-card)] text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)] transition-[border-color,box-shadow] duration-[var(--ds-duration-fast)] disabled:cursor-not-allowed disabled:opacity-50";

function FieldLabel({
  id,
  label,
  hint,
}: {
  id: string;
  label?: string;
  hint?: string;
}) {
  if (!label) return null;
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <label htmlFor={id} className="ds-label">
        {label}
      </label>
      {hint ? <span className="ds-caption">{hint}</span> : null}
    </div>
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export function Input({
  label,
  hint,
  error,
  className,
  id,
  ...rest
}: InputProps) {
  const fieldId = id || rest.name || "ds-input";
  return (
    <div className="w-full">
      <FieldLabel id={fieldId} label={label} hint={hint} />
      <input
        id={fieldId}
        className={cn(
          FIELD_BASE,
          "h-10 px-3 text-[length:var(--ds-text-body-sm-size)]",
          error && "border-[var(--ds-danger)]",
          className
        )}
        aria-invalid={Boolean(error) || undefined}
        {...rest}
      />
      {error ? (
        <p className="mt-1 text-[length:var(--ds-text-caption-size)] text-[var(--ds-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export function Textarea({
  label,
  hint,
  error,
  className,
  id,
  ...rest
}: TextareaProps) {
  const fieldId = id || rest.name || "ds-textarea";
  return (
    <div className="w-full">
      <FieldLabel id={fieldId} label={label} hint={hint} />
      <textarea
        id={fieldId}
        className={cn(
          FIELD_BASE,
          "min-h-24 px-3 py-2 text-[length:var(--ds-text-body-sm-size)]",
          error && "border-[var(--ds-danger)]",
          className
        )}
        aria-invalid={Boolean(error) || undefined}
        {...rest}
      />
      {error ? (
        <p className="mt-1 text-[length:var(--ds-text-caption-size)] text-[var(--ds-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export type SearchInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export function SearchInput({ label, className, id, ...rest }: SearchInputProps) {
  const fieldId = id || rest.name || "ds-search";
  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={fieldId} className="ds-label mb-1.5 block">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-muted)]"
          aria-hidden
        />
        <input
          id={fieldId}
          type="search"
          className={cn(
            FIELD_BASE,
            "h-10 pl-9 pr-3 text-[length:var(--ds-text-body-sm-size)]",
            className
          )}
          {...rest}
        />
      </div>
    </div>
  );
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
  error?: string;
  options: { value: string; label: string }[];
};

export function Select({
  label,
  hint,
  error,
  options,
  className,
  id,
  ...rest
}: SelectProps) {
  const fieldId = id || rest.name || "ds-select";
  return (
    <div className="w-full">
      <FieldLabel id={fieldId} label={label} hint={hint} />
      <select
        id={fieldId}
        className={cn(
          FIELD_BASE,
          "h-10 px-3 text-[length:var(--ds-text-body-sm-size)]",
          error && "border-[var(--ds-danger)]",
          className
        )}
        aria-invalid={Boolean(error) || undefined}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? (
        <p className="mt-1 text-[length:var(--ds-text-caption-size)] text-[var(--ds-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
};

export function Checkbox({ label, className, id, ...rest }: CheckboxProps) {
  const fieldId = id || rest.name || "ds-checkbox";
  return (
    <label
      htmlFor={fieldId}
      className="inline-flex cursor-pointer items-center gap-2 text-[length:var(--ds-text-body-sm-size)] text-[var(--ds-text-primary)]"
    >
      <input
        id={fieldId}
        type="checkbox"
        className={cn(
          "ds-focusable h-4 w-4 rounded border-[var(--ds-border-strong)] text-[var(--ds-brand)]",
          className
        )}
        {...rest}
      />
      <span>{label}</span>
    </label>
  );
}

export type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
};

export function Radio({ label, className, id, ...rest }: RadioProps) {
  const fieldId = id || rest.name || `ds-radio-${String(rest.value ?? "x")}`;
  return (
    <label
      htmlFor={fieldId}
      className="inline-flex cursor-pointer items-center gap-2 text-[length:var(--ds-text-body-sm-size)] text-[var(--ds-text-primary)]"
    >
      <input
        id={fieldId}
        type="radio"
        className={cn(
          "ds-focusable h-4 w-4 border-[var(--ds-border-strong)] text-[var(--ds-brand)]",
          className
        )}
        {...rest}
      />
      <span>{label}</span>
    </label>
  );
}

export type SwitchProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
> & {
  label: string;
};

export function Switch({ label, className, id, checked, ...rest }: SwitchProps) {
  const fieldId = id || rest.name || "ds-switch";
  return (
    <label
      htmlFor={fieldId}
      className="inline-flex cursor-pointer items-center gap-3 text-[length:var(--ds-text-body-sm-size)] text-[var(--ds-text-primary)]"
    >
      <span className="relative inline-flex h-6 w-11 items-center">
        <input
          id={fieldId}
          type="checkbox"
          role="switch"
          checked={checked}
          className="peer sr-only"
          {...rest}
        />
        <span
          className={cn(
            "absolute inset-0 rounded-full bg-[var(--ds-border-strong)] transition-colors duration-[var(--ds-duration-fast)] peer-checked:bg-[var(--ds-brand)] peer-focus-visible:shadow-[var(--ds-focus-ring)] peer-disabled:opacity-50",
            className
          )}
        />
        <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-[var(--ds-shadow-xs)] transition-transform duration-[var(--ds-duration-fast)] peer-checked:translate-x-5" />
      </span>
      <span>{label}</span>
    </label>
  );
}
