/**
 * Client-side Lithuanian name cases for supervisor auth hand-off.
 * Server recomputes if missing; keeps client payload aligned with broker grammar.
 */

const VOCATIVE_OVERRIDES: Record<string, string> = {
  arnas: "Arnai",
};

const DATIVE_OVERRIDES: Record<string, string> = {
  arnas: "Arnui",
};

function withLeadingCase(template: string, original: string): string {
  if (!original) return template;
  if (original[0] === original[0]!.toUpperCase()) {
    return template.charAt(0).toUpperCase() + template.slice(1);
  }
  return template.toLowerCase();
}

export function toLithuanianVocative(firstName: string): string {
  const raw = firstName.trim();
  if (!raw || raw === "Svečias") return raw;
  const key = raw.toLowerCase();
  if (VOCATIVE_OVERRIDES[key]) return VOCATIVE_OVERRIDES[key]!;
  if (/as$/i.test(raw)) return withLeadingCase(`${raw.slice(0, -2)}ai`, raw);
  if (/is$/i.test(raw)) return withLeadingCase(`${raw.slice(0, -2)}i`, raw);
  if (/us$/i.test(raw)) return withLeadingCase(`${raw.slice(0, -2)}au`, raw);
  if (/ė$/i.test(raw)) return withLeadingCase(`${raw.slice(0, -1)}e`, raw);
  return raw;
}

export function toLithuanianDative(firstName: string): string {
  const raw = firstName.trim();
  if (!raw || raw === "Svečias") return raw;
  const key = raw.toLowerCase();
  if (DATIVE_OVERRIDES[key]) return DATIVE_OVERRIDES[key]!;
  if (/as$/i.test(raw)) return withLeadingCase(`${raw.slice(0, -2)}ui`, raw);
  if (/is$/i.test(raw)) return withLeadingCase(`${raw.slice(0, -2)}iui`, raw);
  if (/us$/i.test(raw)) return withLeadingCase(`${raw.slice(0, -2)}ui`, raw);
  if (/a$/i.test(raw)) return withLeadingCase(`${raw.slice(0, -1)}ai`, raw);
  if (/ė$/i.test(raw)) return withLeadingCase(`${raw.slice(0, -1)}ei`, raw);
  return raw;
}
