/** LT vehicle catalog for step-by-step listing wizard (autoplius-style). */

export interface VehicleModification {
  id: string;
  label: string;
  bodyType: string;
  fuelType: string;
  doors: string;
  engineCc?: string;
  powerKw?: string;
}

export const VEHICLE_MAKES = [
  "Audi",
  "BMW",
  "Citroën",
  "Dacia",
  "Fiat",
  "Ford",
  "Honda",
  "Hyundai",
  "Kia",
  "Mazda",
  "Mercedes-Benz",
  "Nissan",
  "Opel",
  "Peugeot",
  "Renault",
  "Seat",
  "Škoda",
  "Toyota",
  "Volkswagen",
  "Volvo",
  "Kita",
] as const;

export const MODELS_BY_MAKE: Record<string, string[]> = {
  Citroën: [
    "Kita",
    "C1",
    "C3",
    "C4",
    "C5",
    "Berlingo",
    "DS3",
    "DS4",
    "DS5",
    "DS7",
    "Xsara",
    "C-Elysée",
    "C4 Picasso",
    "C5 Aircross",
  ],
  Volkswagen: ["Kita", "Golf", "Passat", "Polo", "Tiguan", "Touran", "Transporter"],
  BMW: ["Kita", "320", "520", "X1", "X3", "X5", "118", "218"],
  Audi: ["Kita", "A3", "A4", "A6", "Q3", "Q5", "Q7"],
  Toyota: ["Kita", "Corolla", "Yaris", "RAV4", "Avensis", "C-HR"],
  Opel: ["Kita", "Astra", "Corsa", "Insignia", "Mokka", "Zafira"],
  Ford: ["Kita", "Focus", "Fiesta", "Mondeo", "Kuga", "Transit"],
  Peugeot: ["Kita", "208", "308", "3008", "508", "Partner"],
  Renault: ["Kita", "Clio", "Megane", "Captur", "Scenic", "Kangoo"],
  Volvo: [
    "Kita",
    "V40",
    "V50",
    "V60",
    "V70",
    "V90",
    "S40",
    "S60",
    "S80",
    "S90",
    "XC40",
    "XC60",
    "XC70",
    "XC90",
    "C30",
    "C70",
  ],
  "Mercedes-Benz": [
    "Kita",
    "A-Klasė",
    "B-Klasė",
    "C-Klasė",
    "E-Klasė",
    "S-Klasė",
    "GLA",
    "GLC",
    "GLE",
    "GLK",
    "ML",
    "Vito",
    "Sprinter",
  ],
  Honda: ["Kita", "Civic", "Accord", "CR-V", "HR-V", "Jazz", "Pilot"],
  Hyundai: ["Kita", "i10", "i20", "i30", "Tucson", "Santa Fe", "Kona", "Elantra"],
  Kia: ["Kita", "Ceed", "Sportage", "Sorento", "Picanto", "Rio", "Stonic", "Niro"],
  Nissan: ["Kita", "Qashqai", "Juke", "Micra", "Leaf", "X-Trail", "Navara"],
  Mazda: ["Kita", "2", "3", "6", "CX-3", "CX-5", "CX-30", "MX-5"],
  Seat: ["Kita", "Ibiza", "Leon", "Arona", "Ateca", "Alhambra"],
  Škoda: ["Kita", "Fabia", "Octavia", "Superb", "Kodiaq", "Karoq", "Scala", "Rapid"],
  Dacia: ["Kita", "Sandero", "Duster", "Logan", "Lodgy"],
  Fiat: ["Kita", "500", "Panda", "Punto", "Tipo", "Doblo"],
};

export const MODIFICATIONS_BY_MODEL: Record<string, VehicleModification[]> = {
  "Citroën|DS5": [
    {
      id: "ds5-thp200",
      label: "1.6 THP (200 Hp)",
      bodyType: "Hečbekas",
      fuelType: "Benzinas",
      doors: "4/5",
      engineCc: "1598",
      powerKw: "147",
    },
    {
      id: "ds5-ehdi115",
      label: "1.6 e-HDi (115 Hp) Airdream EGS6",
      bodyType: "Hečbekas",
      fuelType: "Dyzelinas",
      doors: "4/5",
      engineCc: "1560",
      powerKw: "85",
    },
    {
      id: "ds5-hdi160",
      label: "2.0 HDi (160 Hp) Automatic",
      bodyType: "Hečbekas",
      fuelType: "Dyzelinas",
      doors: "4/5",
      engineCc: "1997",
      powerKw: "120",
    },
    {
      id: "ds5-thp155",
      label: "1.6 THP (155 Hp) Automatic",
      bodyType: "Hečbekas",
      fuelType: "Benzinas",
      doors: "4/5",
      engineCc: "1598",
      powerKw: "114",
    },
  ],
};

export const BODY_TYPES = [
  "Sedanas",
  "Hečbekas",
  "Universalas",
  "Visureigis / SUV",
  "Vienatūris",
  "Kupė (Coupe)",
  "Kabrioletas",
  "Pikapas",
  "Komercinis",
] as const;

export const FUEL_TYPES = [
  "Benzinas",
  "Dyzelinas",
  "Elektra",
  "Benzinas / dujos",
  "Benzinas / elektra",
  "Dyzelinas / elektra",
  "Dujos",
] as const;

export const GEARBOX_TYPES = ["Mechaninė", "Automatinė"] as const;

export const DRIVE_TYPES = [
  "Priekiniai (FWD)",
  "Galiniai (RWD)",
  "Visi varantys (AWD / 4x4)",
] as const;

export const DOOR_COUNTS = ["2/3", "4/5", "Kita"] as const;

export const DEFECT_OPTIONS = [
  "Be defektų",
  "Daužtas",
  "Su variklio defektu",
  "Su pavarų dėžės defektu",
  "Kitas defektas",
] as const;

export const STEERING_OPTIONS = ["Kairėje", "Dešinėje"] as const;

/** Autoplius papildomos opcijos (checkbox masyvas → vehicleOptions) */
export const VEHICLE_EQUIPMENT_OPTIONS = [
  "Kondicionierius / Klimato kontrolė",
  "Odinis salonas",
  "Panoraminis stogas",
  "LED / Xenon žibintai",
  "Navigacija / GPS",
  "Atstumo jutikliai",
  "Atbulinės eigos kamera",
  "Kruizo kontrolė (Autopilotas)",
  "Šildomos sėdynės",
  "Lengvojo lydinio ratlankiai",
] as const;

export const COLOR_OPTIONS = [
  "Juoda",
  "Balta",
  "Sidabrinė",
  "Pilka",
  "Mėlyna",
  "Raudona",
  "Žalia",
  "Kita",
] as const;

export const REGISTRATION_YEARS = Array.from(
  { length: 2026 - 1985 + 1 },
  (_, i) => String(2026 - i)
);

export const REGISTRATION_MONTHS = [
  { value: "", label: "—" },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1).padStart(2, "0"),
    label: String(i + 1).padStart(2, "0"),
  })),
];

export function modelsForMake(make: string): string[] {
  return MODELS_BY_MAKE[make] ?? ["Kita"];
}

export function modificationsFor(make: string, model: string): VehicleModification[] {
  return MODIFICATIONS_BY_MODEL[`${make}|${model}`] ?? [];
}

export function engineCcSuggestions(make: string, model: string): string[] {
  const mods = modificationsFor(make, model);
  const set = new Set(mods.map((m) => m.engineCc).filter(Boolean) as string[]);
  return [...set];
}

export function powerKwSuggestions(make: string, model: string): string[] {
  const mods = modificationsFor(make, model);
  const set = new Set(mods.map((m) => m.powerKw).filter(Boolean) as string[]);
  return [...set];
}

export function vehicleSummaryLabel(attrs: Record<string, string | string[] | undefined>): string {
  const make = String(attrs.make ?? "").trim();
  const model = String(attrs.model ?? "").trim();
  const year = String(attrs.year ?? "").trim();
  if (!make && !model) return "";
  const base = [make, model].filter(Boolean).join(" ");
  return year ? `${base} | ${year}` : base;
}
