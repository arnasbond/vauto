"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { AiFilledBadge } from "@/components/buddy/AiFilledBadge";
import type { CategoryFieldDef } from "@/lib/adaptive-categories";

interface CategoryFieldsEditorProps {
  fields: CategoryFieldDef[];
  attributes: Record<string, string | string[] | undefined>;
  onChange: (key: string, value: string | string[]) => void;
  layout: "grid" | "tags" | "sheet" | "stack";
  missingKeys?: string[];
  variant?: "default" | "inline";
  showAiFilled?: boolean;
  aiFilledKeys?: ReadonlySet<string>;
}

export function CategoryFieldsEditor({
  fields,
  attributes,
  onChange,
  layout,
  missingKeys = [],
  variant = "default",
  showAiFilled = false,
  aiFilledKeys,
}: CategoryFieldsEditorProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const startEdit = (key: string) => {
    const val = attributes[key];
    setEditing(key);
    setDraft(Array.isArray(val) ? val.join(", ") : String(val ?? ""));
  };

  const save = (field: CategoryFieldDef) => {
    if (field.inputType === "checklist") return;
    onChange(field.key, draft);
    setEditing(null);
  };

  const toggleChecklist = (field: CategoryFieldDef, option: string) => {
    const current = (attributes[field.key] as string[] | undefined) ?? [];
    const next = current.includes(option)
      ? current.filter((x) => x !== option)
      : [...current, option];
    onChange(field.key, next);
  };

  const wrapperClass =
    layout === "grid"
      ? variant === "inline"
        ? "grid grid-cols-2 gap-2"
        : "grid grid-cols-2 gap-2"
      : layout === "tags"
        ? variant === "inline"
          ? "grid grid-cols-3 gap-2"
          : "flex flex-wrap gap-2"
        : layout === "sheet"
          ? variant === "inline"
            ? "grid grid-cols-2 gap-2"
            : "divide-y divide-white/10 rounded-xl border border-white/10"
          : "flex flex-col gap-2";

  const inlineInputClass =
    "mt-1 w-full rounded-lg border border-white/5 bg-white/5 p-2 text-xs text-white outline-none focus:border-[var(--vauto-teal)]";

  return (
    <div className={wrapperClass}>
      {fields.map((field) => {
        const missing = missingKeys.includes(field.key);
        const value = attributes[field.key];
        const display = Array.isArray(value)
          ? value.join(", ")
          : String(value ?? "");

        if (variant === "inline" && field.inputType !== "checklist") {
          if (field.inputType === "select" && field.options) {
            return (
              <div
                key={field.key}
                className={field.gridSpan === 2 ? "col-span-2" : ""}
              >
                <label className="text-xs text-white/40">
                  {field.label}
                  {missing && <span className="ml-1 text-amber-400">●</span>}
                  {showAiFilled && aiFilledKeys?.has(field.key) && (
                    <AiFilledBadge visible />
                  )}
                </label>
                <select
                  value={display}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  className={inlineInputClass}
                >
                  <option value="" className="bg-slate-800">
                    Pasirinkite…
                  </option>
                  {field.options.map((o) => (
                    <option key={o} value={o} className="bg-slate-800">
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          return (
            <div
              key={field.key}
              className={field.gridSpan === 2 ? "col-span-2" : ""}
            >
              <label className="text-xs text-white/40">
                {field.label}
                {field.critical && <span className="text-amber-400"> *</span>}
              </label>
              <input
                type="text"
                value={display}
                onChange={(e) => onChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                className={`${inlineInputClass} ${missing ? "border-amber-400/40" : ""}`}
              />
            </div>
          );
        }

        if (field.inputType === "checklist" && field.options) {
          return (
            <div
              key={field.key}
              className={
                layout === "sheet"
                  ? "p-3"
                  : "w-full rounded-xl bg-white/5 p-3"
              }
            >
              <p className="mb-2 text-xs font-medium text-slate-400">
                {field.label}
                {field.critical && <span className="text-amber-400"> *</span>}
              </p>
              <div className="flex flex-wrap gap-2">
                {field.options.map((opt) => {
                  const checked = ((value as string[]) ?? []).includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleChecklist(field, opt)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                        checked
                          ? "bg-[var(--vauto-orange)] text-white"
                          : "bg-white/10 text-slate-300 hover:bg-white/15"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }

        if (field.inputType === "select" && field.options) {
          return (
            <div
              key={field.key}
              className={`${field.gridSpan === 2 ? "col-span-2" : ""} ${
                layout === "tags"
                  ? "rounded-full"
                  : layout === "sheet"
                    ? "p-3"
                    : "rounded-xl bg-white/5 p-3"
              }`}
            >
              <p className="mb-1.5 text-xs text-slate-400">
                {field.label}
                {missing && <span className="ml-1 text-amber-400">●</span>}
              </p>
              <select
                value={display}
                onChange={(e) => onChange(field.key, e.target.value)}
                className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-[var(--vauto-teal)]"
              >
                <option value="" className="bg-slate-800">
                  Pasirinkite…
                </option>
                {field.options.map((o) => (
                  <option key={o} value={o} className="bg-slate-800">
                    {o}
                  </option>
                ))}
              </select>
            </div>
          );
        }

        const cellClass =
          layout === "tags"
            ? `inline-flex min-w-[45%] flex-1 flex-col rounded-2xl border px-3 py-2.5 ${
                missing
                  ? "border-amber-400/50 bg-amber-400/10"
                  : "border-white/10 bg-white/5"
              }`
            : layout === "sheet"
              ? `p-3 ${missing ? "bg-amber-400/5" : ""}`
              : `rounded-xl bg-white/5 p-3 ${field.gridSpan === 2 ? "col-span-2" : ""} ${
                  missing ? "ring-1 ring-amber-400/40" : ""
                }`;

        return (
          <div key={field.key} className={cellClass}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-400">
                  {field.label}
                  {field.critical && <span className="text-amber-400"> *</span>}
                </p>
                {editing === field.key ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && save(field)}
                    placeholder={field.placeholder}
                    className="mt-1 w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white outline-none"
                  />
                ) : (
                  <p
                    className={`mt-0.5 text-sm font-medium ${
                      display ? "text-white" : "text-slate-500"
                    }`}
                  >
                    {display || field.placeholder || "—"}
                  </p>
                )}
              </div>
              {editing === field.key ? (
                <button
                  type="button"
                  onClick={() => save(field)}
                  className="shrink-0 rounded-lg bg-[var(--vauto-teal)] px-2 py-1 text-xs text-white"
                >
                  OK
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => startEdit(field.key)}
                  className="shrink-0 rounded-lg bg-white/10 p-1.5 text-slate-400 hover:text-white"
                  aria-label={`Redaguoti ${field.label}`}
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
