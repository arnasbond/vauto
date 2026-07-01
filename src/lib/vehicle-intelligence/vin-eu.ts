/** Client-side EU VIN decode (WMI + NHTSA open APIs). */

const WMI_TABLE: Record<string, { make: string; country: string }> = {
  VF7: { make: "Citroën", country: "France" },
  VF3: { make: "Peugeot", country: "France" },
  VF1: { make: "Renault", country: "France" },
  VSS: { make: "SEAT", country: "Spain" },
  VWV: { make: "Volkswagen", country: "Germany" },
  WVW: { make: "Volkswagen", country: "Germany" },
  WBA: { make: "BMW", country: "Germany" },
  WDB: { make: "Mercedes-Benz", country: "Germany" },
  WAU: { make: "Audi", country: "Germany" },
  SKO: { make: "Škoda", country: "Czech Republic" },
  TMB: { make: "Škoda", country: "Czech Republic" },
  YV1: { make: "Volvo", country: "Sweden" },
  ZFA: { make: "Fiat", country: "Italy" },
};

const MODEL_YEAR: Record<string, number> = {
  A: 2010, B: 2011, C: 2012, D: 2013, E: 2014, F: 2015, G: 2016, H: 2017,
  J: 2018, K: 2019, L: 2020, M: 2021, N: 2022, P: 2023, R: 2024, S: 2025,
  T: 2026, V: 2027, W: 2028, X: 2029, Y: 2030,
  "1": 2001, "2": 2002, "3": 2003, "4": 2004, "5": 2005,
  "6": 2006, "7": 2007, "8": 2008, "9": 2009,
};

const EU_WMI = new Set(Object.keys(WMI_TABLE));

export function isEuropeanWmiPrefix(vin: string): boolean {
  const wmi = vin.trim().toUpperCase().slice(0, 3);
  if (EU_WMI.has(wmi)) return true;
  return wmi.startsWith("VF") || wmi.startsWith("VR") || wmi.startsWith("VS");
}

function guessModel(vin: string, make: string): string {
  const vds = vin.slice(3, 8);
  if (make.toLowerCase().includes("citro")) {
    if (/FRHC|FRHY|FRHZ/i.test(vds)) return "DS5";
    if (/7RH/i.test(vds)) return "C4";
  }
  return "Modelis";
}

export async function lookupEuVinClient(vin: string): Promise<{
  make: string;
  model: string;
  year: string;
  country: string;
} | null> {
  const normalized = vin.trim().toUpperCase();
  const wmi = normalized.slice(0, 3);
  const local = WMI_TABLE[wmi];
  if (!local && !isEuropeanWmiPrefix(normalized)) return null;

  let make = local?.make ?? "Nežinoma";
  const country = local?.country ?? "Europe";

  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeWMI/${encodeURIComponent(wmi)}?format=json`
    );
    if (res.ok) {
      const json = (await res.json()) as { Results?: { Manufacturer?: string }[] };
      const remote = json.Results?.[0]?.Manufacturer?.trim();
      if (remote) make = remote;
    }
  } catch {
    /* optional */
  }

  if (make === "Nežinoma" || make === "Unknown") return null;

  const yearChar = normalized[9];
  const year = MODEL_YEAR[yearChar] ? String(MODEL_YEAR[yearChar]) : "—";
  const model = guessModel(normalized, make);

  return { make, model, year, country };
}
