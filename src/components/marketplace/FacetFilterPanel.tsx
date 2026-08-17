"use client";

import { useEffect, useRef, useState } from "react";
import { CANONICAL_VERTICALS, getFilterableAttributes } from "@vauto/shared/marketplace-domain";
import type {
  AttributeDefinition,
  FacetPredicate,
  FacetSortId,
  ParsedFacetQuery,
  VerticalId,
} from "@vauto/shared/marketplace-domain";
import { Input, Select, Checkbox } from "@/design-system";
import { cn } from "@/lib/cn";

const SORT_OPTIONS: { value: FacetSortId; label: string }[] = [
  { value: "relevance", label: "Relevantiškiausi" },
  { value: "newest", label: "Naujausi" },
  { value: "price_asc", label: "Kaina: pigiausi" },
  { value: "price_desc", label: "Kaina: brangiausi" },
];

function predEq(query: ParsedFacetQuery, key: string): string {
  const hit = query.predicates.find((p) => p.kind === "eq" && p.key === key);
  return hit && hit.kind === "eq" ? hit.value : "";
}

function predBound(query: ParsedFacetQuery, key: string, kind: "min" | "max"): string {
  const hit = query.predicates.find((p) => p.kind === kind && p.key === key);
  return hit && (hit.kind === "min" || hit.kind === "max") ? String(hit.value) : "";
}

function predContains(query: ParsedFacetQuery, key: string): string {
  const hit = query.predicates.find(
    (p) => (p.kind === "contains" || p.kind === "location") && p.key === key
  );
  return hit && (hit.kind === "contains" || hit.kind === "location") ? hit.value : "";
}

function predIn(query: ParsedFacetQuery, key: string): string[] {
  const hit = query.predicates.find((p) => p.kind === "in" && p.key === key);
  return hit && hit.kind === "in" ? [...hit.values] : [];
}

function replacePreds(
  query: ParsedFacetQuery,
  key: string,
  next: FacetPredicate[]
): ParsedFacetQuery {
  return {
    ...query,
    predicates: [...query.predicates.filter((p) => p.key !== key), ...next],
  };
}

function FieldControl({
  def,
  query,
  idPrefix,
  onChange,
}: {
  def: AttributeDefinition;
  query: ParsedFacetQuery;
  idPrefix: string;
  onChange: (next: ParsedFacetQuery) => void;
}) {
  const id = `${idPrefix}-${def.key}`;

  if (def.type === "enum" && def.options) {
    return (
      <Select
        id={id}
        label={def.label}
        value={predEq(query, def.key)}
        options={[
          { value: "", label: "Visi" },
          ...def.options.map((o) => ({ value: o, label: o })),
        ]}
        onChange={(e) => {
          const value = e.target.value;
          onChange(
            replacePreds(
              query,
              def.key,
              value ? [{ kind: "eq", key: def.key, value }] : []
            )
          );
        }}
      />
    );
  }

  if (def.type === "multi_enum" && def.options) {
    const selected = new Set(predIn(query, def.key));
    return (
      <fieldset className="space-y-1.5">
        <legend className="text-[12px] font-semibold text-[var(--ds-text-primary)]">
          {def.label}
        </legend>
        {def.options.map((opt) => (
          <Checkbox
            key={opt}
            id={`${id}-${opt}`}
            label={opt}
            checked={selected.has(opt)}
            onChange={(e) => {
              const next = new Set(selected);
              if (e.target.checked) next.add(opt);
              else next.delete(opt);
              const values = [...next];
              onChange(
                replacePreds(
                  query,
                  def.key,
                  values.length ? [{ kind: "in", key: def.key, values }] : []
                )
              );
            }}
          />
        ))}
      </fieldset>
    );
  }

  if (def.type === "number" || def.type === "range") {
    const minVal = predBound(query, def.key, "min") || predEq(query, def.key);
    const maxVal = predBound(query, def.key, "max");
    const commitRange = (minRaw: string, maxRaw: string) => {
      const next: FacetPredicate[] = [];
      const minN = Number(minRaw);
      const maxN = Number(maxRaw);
      if (minRaw && Number.isFinite(minN)) {
        next.push({ kind: "min", key: def.key, value: minN });
      }
      if (maxRaw && Number.isFinite(maxN)) {
        next.push({ kind: "max", key: def.key, value: maxN });
      }
      onChange(replacePreds(query, def.key, next));
    };
    return (
      <div className="grid grid-cols-2 gap-2">
        <Input
          id={`${id}-min`}
          label={`${def.label} nuo`}
          type="number"
          inputMode="numeric"
          value={minVal}
          onChange={(e) => commitRange(e.target.value.trim(), maxVal)}
        />
        <Input
          id={`${id}-max`}
          label={`${def.label} iki`}
          type="number"
          inputMode="numeric"
          value={maxVal}
          onChange={(e) => commitRange(minVal, e.target.value.trim())}
        />
      </div>
    );
  }

  if (def.type === "boolean") {
    const on = query.predicates.some((p) => p.kind === "boolean" && p.key === def.key && p.value);
    return (
      <Checkbox
        id={id}
        label={def.label}
        checked={on}
        onChange={(e) =>
          onChange(
            replacePreds(
              query,
              def.key,
              e.target.checked ? [{ kind: "boolean", key: def.key, value: true }] : []
            )
          )
        }
      />
    );
  }

  return (
    <TextFacetInput def={def} query={query} id={id} onChange={onChange} />
  );
}

/**
 * Controlled text/location facet. Raw keystrokes (including spaces) stay in
 * the input. Trim runs only at commit boundary: blur, or when the trimmed
 * value actually changes (avoids URL spam on trailing whitespace).
 */
function TextFacetInput({
  def,
  query,
  id,
  onChange,
}: {
  def: AttributeDefinition;
  query: ParsedFacetQuery;
  id: string;
  onChange: (next: ParsedFacetQuery) => void;
}) {
  const kind = def.type === "location" ? "location" : "contains";
  const committed =
    predContains(query, def.key) || predEq(query, def.key);
  const [draft, setDraft] = useState(committed);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(committed);
  }, [committed]);

  const commitTrimmed = (raw: string) => {
    const text = raw.trim();
    if (text === committed.trim()) {
      if (!text) {
        onChange(replacePreds(query, def.key, []));
      }
      return;
    }
    onChange(
      replacePreds(
        query,
        def.key,
        text ? [{ kind, key: def.key, value: text }] : []
      )
    );
  };

  return (
    <Input
      id={id}
      label={def.label}
      value={draft}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw.trim() !== committed.trim()) commitTrimmed(raw);
      }}
      onBlur={(e) => {
        focusedRef.current = false;
        const raw = e.target.value;
        commitTrimmed(raw);
        setDraft(raw.trim());
      }}
    />
  );
}

export function FacetFilterPanel({
  query,
  onChange,
  onVerticalChange,
  idPrefix = "facet",
  className,
}: {
  query: ParsedFacetQuery;
  onChange: (next: ParsedFacetQuery) => void;
  onVerticalChange: (id: VerticalId | null) => void;
  idPrefix?: string;
  className?: string;
}) {
  const fields = query.verticalId ? getFilterableAttributes(query.verticalId) : [];

  return (
    <div
      className={cn("space-y-3", className)}
      data-facet-panel
      data-facet-vertical={query.verticalId ?? ""}
    >
      <Select
        id={`${idPrefix}-vertical`}
        data-facet-vertical-select
        label="Kategorija"
        value={query.verticalId ?? ""}
        options={[
          { value: "", label: "Visos kategorijos" },
          ...CANONICAL_VERTICALS.map((v) => ({ value: v.id, label: v.label })),
        ]}
        onChange={(e) =>
          onVerticalChange((e.target.value || null) as VerticalId | null)
        }
      />
      <Select
        id={`${idPrefix}-sort`}
        label="Rikiavimas"
        value={query.sort}
        options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        onChange={(e) =>
          onChange({ ...query, sort: e.target.value as FacetSortId, page: 1 })
        }
      />
      {fields.map((def) => (
        <div key={def.key} data-facet-key={def.key}>
          <FieldControl
            def={def}
            query={query}
            idPrefix={idPrefix}
            onChange={onChange}
          />
        </div>
      ))}
    </div>
  );
}
