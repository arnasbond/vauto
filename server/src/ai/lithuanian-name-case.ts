/** Lithuanian first-name šauksmininkas (vocative) and naudininkas (dative) for broker copy. */

const VOCATIVE_OVERRIDES: Record<string, string> = {
  arnas: "Arnai",
  jonas: "Jonai",
  tomas: "Tomai",
  mantas: "Mantai",
  lukas: "Lukai",
  paulius: "Pauliau",
  andrius: "Andriau",
  marius: "Mariau",
  tadas: "Tadai",
  vytas: "Vytai",
  gediminas: "Gediminai",
  mindaugas: "Mindaugai",
  petras: "Petrai",
  antanas: "Antanai",
  juozas: "Juozai",
  kęstutis: "Kęstuti",
  kestutis: "Kęstuti",
  algirdas: "Algirdai",
  rimantas: "Rimantai",
  donatas: "Donatai",
};

const DATIVE_OVERRIDES: Record<string, string> = {
  arnas: "Arnui",
  jonas: "Jonui",
  tomas: "Tomui",
  mantas: "Mantui",
  lukas: "Lukui",
  paulius: "Pauliui",
  andrius: "Andriui",
  marius: "Mariui",
  tadas: "Tadui",
  vytas: "Vytui",
  gediminas: "Gediminui",
  mindaugas: "Mindaugui",
  petras: "Petrai",
  antanas: "Antanui",
  juozas: "Juozui",
  kęstutis: "Kęstučiui",
  kestutis: "Kęstučiui",
  algirdas: "Algirdui",
  rimantas: "Rimantui",
  donatas: "Donatui",
};

function withLeadingCase(template: string, original: string): string {
  if (!original) return template;
  if (original[0] === original[0]!.toUpperCase()) {
    return template.charAt(0).toUpperCase() + template.slice(1);
  }
  return template.toLowerCase();
}

/** Šauksmininkas — direct address („Sveikas, Arnai!“). */
export function toLithuanianVocative(firstName: string): string {
  const raw = firstName.trim();
  if (!raw || raw === "Svečias" || raw.toLowerCase() === "drauge") return raw;

  const key = raw.toLowerCase();
  if (VOCATIVE_OVERRIDES[key]) return VOCATIVE_OVERRIDES[key]!;

  if (/as$/i.test(raw)) {
    return withLeadingCase(`${raw.slice(0, -2)}ai`, raw);
  }
  if (/is$/i.test(raw)) {
    return withLeadingCase(`${raw.slice(0, -2)}i`, raw);
  }
  if (/us$/i.test(raw)) {
    return withLeadingCase(`${raw.slice(0, -2)}au`, raw);
  }
  if (/ė$/i.test(raw)) {
    return withLeadingCase(`${raw.slice(0, -1)}e`, raw);
  }
  return raw;
}

/** Naudininkas — ownership / benefit („Arnui ieškome…“). */
export function toLithuanianDative(firstName: string): string {
  const raw = firstName.trim();
  if (!raw || raw === "Svečias" || raw.toLowerCase() === "drauge") return raw;

  const key = raw.toLowerCase();
  if (DATIVE_OVERRIDES[key]) return DATIVE_OVERRIDES[key]!;

  if (/as$/i.test(raw)) {
    return withLeadingCase(`${raw.slice(0, -2)}ui`, raw);
  }
  if (/is$/i.test(raw)) {
    return withLeadingCase(`${raw.slice(0, -2)}iui`, raw);
  }
  if (/us$/i.test(raw)) {
    return withLeadingCase(`${raw.slice(0, -2)}ui`, raw);
  }
  if (/a$/i.test(raw)) {
    return withLeadingCase(`${raw.slice(0, -1)}ai`, raw);
  }
  if (/ė$/i.test(raw)) {
    return withLeadingCase(`${raw.slice(0, -1)}ei`, raw);
  }
  return raw;
}
