/** EU / non-US WMI hints for open VIN decode (ISO 3779). */

export interface WmiDecode {
  wmi: string;
  make: string;
  country: string;
  region: "eu" | "us" | "other";
}

const EU_WMI_PREFIXES = new Set([
  "VF1",
  "VF2",
  "VF3",
  "VF4",
  "VF5",
  "VF6",
  "VF7",
  "VF8",
  "VR1",
  "VR3",
  "VS6",
  "VS7",
  "VS8",
  "VN1",
  "VSS",
  "VWV",
  "WBA",
  "WBS",
  "WDB",
  "WDD",
  "WAU",
  "WVW",
  "WV1",
  "WV2",
  "WV3",
  "TMB",
  "TMK",
  "SKO",
  "YV1",
  "YV4",
  "ZFA",
  "ZFF",
]);

const WMI_TABLE: Record<string, Omit<WmiDecode, "wmi">> = {
  VF7: { make: "Citroën", country: "France", region: "eu" },
  VF3: { make: "Peugeot", country: "France", region: "eu" },
  VF1: { make: "Renault", country: "France", region: "eu" },
  VSS: { make: "SEAT", country: "Spain", region: "eu" },
  VWV: { make: "Volkswagen", country: "Germany", region: "eu" },
  WVW: { make: "Volkswagen", country: "Germany", region: "eu" },
  WBA: { make: "BMW", country: "Germany", region: "eu" },
  WDB: { make: "Mercedes-Benz", country: "Germany", region: "eu" },
  WAU: { make: "Audi", country: "Germany", region: "eu" },
  SKO: { make: "Škoda", country: "Czech Republic", region: "eu" },
  TMB: { make: "Škoda", country: "Czech Republic", region: "eu" },
  YV1: { make: "Volvo", country: "Sweden", region: "eu" },
  ZFA: { make: "Fiat", country: "Italy", region: "eu" },
};

/** Model year from VIN position 10 (ISO 3779 cycle). */
const MODEL_YEAR_CHARS: Record<string, number> = {
  A: 2010,
  B: 2011,
  C: 2012,
  D: 2013,
  E: 2014,
  F: 2015,
  G: 2016,
  H: 2017,
  J: 2018,
  K: 2019,
  L: 2020,
  M: 2021,
  N: 2022,
  P: 2023,
  R: 2024,
  S: 2025,
  T: 2026,
  V: 2027,
  W: 2028,
  X: 2029,
  Y: 2030,
  "1": 2001,
  "2": 2002,
  "3": 2003,
  "4": 2004,
  "5": 2005,
  "6": 2006,
  "7": 2007,
  "8": 2008,
  "9": 2009,
};

export function decodeVinModelYear(vin: string): string | undefined {
  const ch = vin.trim().toUpperCase()[9];
  if (!ch) return undefined;
  const year = MODEL_YEAR_CHARS[ch];
  return year ? String(year) : undefined;
}

export function isEuropeanWmi(wmi: string): boolean {
  const code = wmi.trim().toUpperCase().slice(0, 3);
  if (EU_WMI_PREFIXES.has(code)) return true;
  return WMI_TABLE[code]?.region === "eu";
}

export function decodeWmiLocal(vin: string): WmiDecode | null {
  const wmi = vin.trim().toUpperCase().slice(0, 3);
  if (wmi.length < 3) return null;
  const hit = WMI_TABLE[wmi];
  if (hit) return { wmi, ...hit };
  if (wmi.startsWith("VF") || wmi.startsWith("VR") || wmi.startsWith("VS")) {
    return { wmi, make: "Stellantis (EU)", country: "Europe", region: "eu" };
  }
  if (/^[1-5]/.test(wmi[0] ?? "")) {
    return { wmi, make: "Unknown", country: "North America", region: "us" };
  }
  return { wmi, make: "Unknown", country: "Unknown", region: "other" };
}

/** Heuristic model hint from VDS (positions 4–8) for Stellantis/Citroën. */
export function guessEuModelFromVin(vin: string, make: string): string | undefined {
  const vds = vin.trim().toUpperCase().slice(3, 8);
  if (!vds) return undefined;
  const makeLower = make.toLowerCase();
  if (makeLower.includes("citro")) {
    if (/FRHC|FRHY|FRHZ/i.test(vds)) return "DS5";
    if (/7RH/i.test(vds)) return "C4";
    if (/8R/i.test(vds)) return "C5";
  }
  if (makeLower.includes("peugeot")) {
    if (/8HR/i.test(vds)) return "308";
    if (/3HR/i.test(vds)) return "3008";
  }
  return undefined;
}
