/**
 * Lithuanian labels for listing attribute keys (Vision / OCR / Pass-1 JSON).
 * Brand/model values stay as-is; keys must never leak as camelCase into copy.
 */

export const ATTR_LABEL_LT: Record<string, string> = {
  make: "Markė",
  model: "Modelis",
  year: "Metai",
  mileage: "Rida (km)",
  mileageKm: "Rida (km)",
  engine: "Variklis",
  engineCc: "Variklio tūris (cm³)",
  engineDisplacement: "Variklio tūris",
  powerKw: "Galia (kW)",
  powerHp: "Galia (AG)",
  fuelType: "Kuras",
  fuel: "Kuras",
  transmission: "Pavarų dėžė",
  gearbox: "Pavarų dėžė",
  driveType: "Varomieji ratai",
  bodyType: "Kėbulas",
  color: "Spalva",
  colors: "Spalva",
  exteriorColor: "Išorės spalva",
  interiorColor: "Salono spalva",
  seats: "Sėdimų vietų",
  doors: "Durys",
  vin: "VIN",
  licensePlate: "Valstybinis numeris",
  plateNumber: "Valstybinis numeris",
  firstRegistration: "Pirma registracija",
  registrationDate: "Registracijos data",
  taExpiry: "TA galioja iki",
  technicalInspection: "Techninė apžiūra",
  euroStandard: "Euro standartas",
  brand: "Prekės ženklas",
  manufacturer: "Gamintojas",
  deviceModel: "Modelis",
  storageCapacity: "Atmintis",
  storage: "Atmintis",
  memory: "Atmintis",
  capacity: "Talpa",
  condition: "Būklė",
  defects: "Defektai",
  warranty: "Garantija",
  size: "Dydis",
  clothingSize: "Dydis",
  battery: "Baterija",
  batteryHealth: "Baterijos būklė",
  weight: "Svoris",
  material: "Medžiaga",
  fabric: "Audinys",
  steering: "Vairas",
  wheels: "Ratlankiai",
  wheelSize: "Ratlankių dydis",
  tireSize: "Padangų dydis",
  rooms: "Kambariai",
  area: "Plotas",
  areaSqm: "Plotas (m²)",
  plotas: "Plotas",
  floor: "Aukštas",
  specialty: "Specializacija",
  specialtyLabel: "Specializacija",
  jobType: "Pareigos",
  position: "Pareigos",
  experience: "Patirtis",
  serviceArea: "Aptarnavimo zona",
  charger: "Įkroviklis",
  box: "Dėžutė",
  accessories: "Priedai",
};

/** Prefer known LT label; otherwise produce a readable spaced key (not English Title Case). */
export function humanizeAttributeKeyLt(key: string): string {
  const hint = ATTR_LABEL_LT[key];
  if (hint) return hint;
  const trimmed = key.trim();
  if (!trimmed) return key;
  // Already human / LT label from Vision OCR.
  if (/[\sĄČĘĖĮŠŲŪŽąčęėįšųūž]/.test(trimmed) || /^[A-ZĄČĘĖĮŠŲŪŽ]/.test(trimmed)) {
    return trimmed;
  }
  // camelCase / snake → lower spaced words (neutral), never "Body Type".
  return trimmed
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Rewrite markdown / bullet lines that dump camelCase keys as labels:
 * `- **bodyType:** Sedanas` → `- **Kėbulas:** Sedanas`
 */
export function sanitizeAttributeKeyLabelsInText(raw: string): string {
  if (!raw?.trim()) return raw ?? "";
  return raw
    .split("\n")
    .map((line) => {
      const m = line.match(
        /^(\s*[-•*]?\s*\*{0,2})([A-Za-z][A-Za-z0-9_]{1,40})(\*{0,2}\s*:\s*)(.*)$/
      );
      if (!m) return line;
      const key = m[2]!;
      if (!/^[a-z]+(?:[A-Z][a-z0-9]+)+$/.test(key) && !ATTR_LABEL_LT[key]) {
        // Only rewrite camelCase or known keys — leave natural LT lines alone.
        if (!ATTR_LABEL_LT[key]) return line;
      }
      const label = humanizeAttributeKeyLt(key);
      if (label === key) return line;
      return `${m[1]}${label}${m[3]}${m[4]}`;
    })
    .join("\n");
}
