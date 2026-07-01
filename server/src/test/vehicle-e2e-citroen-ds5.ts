/**
 * Pilnas E2E integracijos testas — Citroën DS5 (NOG675 + VF7KFRHC8CS517606).
 * Simuliuoja OCR → validacija → open-data lookup → sujungimas → Gemini aprašymas.
 *
 * Run: npx tsx src/test/vehicle-e2e-citroen-ds5.ts
 */
import "../load-env.js";
import { hasAiKey, unifiedLlmJson } from "../ai/llm-provider.js";
import {
  classifyOcrLine,
  extractPlateToken,
  extractVinToken,
} from "../services/visual-pipeline/providers/ocr.js";
import { lookupLtOpenData } from "../vehicle/lt-ta-open-data.js";
import { lookupVin } from "../vehicle/vin-lookup.js";
import { normalizeLtPlate } from "../vehicle/plate-lookup.js";
import {
  lookupVehicleOnServer,
  type ServerVehicleLookupResult,
} from "../vehicle/vehicle-lookup-route.js";
import {
  isPlausibleVin,
  isValidVin,
  isValidVinChecksum,
  isValidVinForLookup,
  normalizeVin,
} from "../vehicle/vin-utils.js";

const PLATE_RAW = "NOG675";
const VIN_RAW = "VF7KFRHC8CS517606";

/** Simuliuojamos OCR eilutės iš skirtingų nuotraukų (numeris + VIN lipdukas). */
const SIMULATED_OCR_LINES = [
  "CITROEN",
  "DS5",
  "VALST. NR. NOG 675",
  "VF7KFRHC8CS517606",
  "GAMYBA 2012",
  "1.6 HDI",
];

export interface OcrSimulationResult {
  lines: string[];
  extractedPlate: string | null;
  extractedVin: string | null;
  lineClassification: Array<{ line: string; kind: string }>;
}

export interface MergedVehicleRecord {
  plateNumber: string;
  vin: string;
  make: string;
  model: string;
  year: string;
  fuelType: string;
  engine: string;
  bodyType: string;
  gearbox?: string;
  powerKw?: string;
  powerHp?: string;
  mileage?: string;
  mileageRecords: Array<{ date: string; km: string }>;
  taExpiry: string;
  taValid: boolean;
  registrationCountry: string;
  dataSources: string[];
  verified: boolean;
  confidence: number;
  validation: {
    plausibleVin: boolean;
    usChecksumValid: boolean;
    euVinAccepted: boolean;
    isValidVinRelaxed: boolean;
  };
}

export interface E2eTestOutput {
  testId: string;
  timestamp: string;
  ocr: OcrSimulationResult;
  lookupByVin: ServerVehicleLookupResult | null;
  lookupByPlate: ServerVehicleLookupResult | null;
  merged: MergedVehicleRecord;
  gemini: {
    available: boolean;
    title?: string;
    description?: string;
    confidence?: number;
    error?: string;
    fallbackUsed?: boolean;
  };
}

function simulateOcrFromPhotoLines(lines: string[]): OcrSimulationResult {
  let extractedPlate: string | null = null;
  let extractedVin: string | null = null;
  const lineClassification: OcrSimulationResult["lineClassification"] = [];

  for (const line of lines) {
    lineClassification.push({ line, kind: classifyOcrLine(line) });
    const plate = extractPlateToken(line);
    const vin = extractVinToken(line);
    if (plate && !extractedPlate) extractedPlate = plate;
    if (vin && !extractedVin) extractedVin = vin;
  }

  const fullText = lines.join("\n");
  if (!extractedPlate) extractedPlate = extractPlateToken(fullText);
  if (!extractedVin) extractedVin = extractVinToken(fullText);

  return { lines, extractedPlate, extractedVin, lineClassification };
}

function enrichFromOcrLines(merged: MergedVehicleRecord, lines: string[]): MergedVehicleRecord {
  const text = lines.join(" ").toUpperCase();
  const out = { ...merged };

  if (/HDI|DYZEL|DIESEL/i.test(text) && out.fuelType === "Nežinoma") {
    out.fuelType = "Dyzelinas";
  }
  const engineMatch = text.match(/\b(\d(?:[.,]\d)?)\s*HDI\b/i);
  if (engineMatch && out.engine === "Nežinomas") {
    out.engine = `${engineMatch[1].replace(",", ".")} HDi`;
  }
  const yearMatch = text.match(/GAMYBA\s+(\d{4})|(?:^|\s)(20\d{2})(?:\s|$)/);
  if (yearMatch && out.year === "—") {
    out.year = yearMatch[1] ?? yearMatch[2] ?? out.year;
  }
  if (/CITROEN/i.test(text) && out.make === "Nežinoma") out.make = "Citroën";
  if (/\bDS5\b/i.test(text) && out.model === "Modelis") out.model = "DS5";

  if (out.fuelType !== "Nežinoma" || out.engine !== "Nežinomas") {
    out.dataSources = [...new Set([...out.dataSources, "ocr-hints"])];
  }
  return out;
}

function mergeVehicleRecords(
  ocr: OcrSimulationResult,
  vinLookup: ServerVehicleLookupResult | null,
  plateLookup: ServerVehicleLookupResult | null,
  openTa: Awaited<ReturnType<typeof lookupLtOpenData>>
): MergedVehicleRecord {
  const primary = vinLookup ?? plateLookup;
  const plate = normalizeLtPlate(ocr.extractedPlate ?? PLATE_RAW);
  const vin = normalizeVin(ocr.extractedVin ?? VIN_RAW);

  const sources = new Set<string>();
  if (vinLookup) sources.add(vinLookup.source);
  if (plateLookup) sources.add(plateLookup.source);
  if (openTa) sources.add(openTa.source);

  const mileage =
    openTa?.mileage ??
    (primary && "mileage" in primary ? primary.mileage : undefined);
  const mileageRecords =
    openTa?.mileageRecords?.length
      ? openTa.mileageRecords
      : primary && "mileageRecords" in primary
        ? primary.mileageRecords
        : [];
  const taExpiry =
    openTa?.taExpiry ??
    (primary && "taExpiry" in primary ? primary.taExpiry : "—");
  const taValid =
    openTa?.taValid ??
    (primary && "taValid" in primary ? primary.taValid : false);

  const make = primary?.make ?? "Nežinoma";
  const model = primary?.model ?? "Modelis";
  const year = primary?.year ?? "—";

  return {
    plateNumber: plate,
    vin,
    make,
    model,
    year,
    fuelType: primary?.fuelType ?? "Nežinoma",
    engine: primary?.engine ?? "Nežinomas",
    bodyType: primary?.bodyType ?? "Nežinomas",
    gearbox: primary && "gearbox" in primary ? primary.gearbox : undefined,
    powerKw: primary && "powerKw" in primary ? primary.powerKw : undefined,
    powerHp: primary && "powerHp" in primary ? primary.powerHp : undefined,
    mileage,
    mileageRecords,
    taExpiry,
    taValid,
    registrationCountry: primary?.registrationCountry ?? "LT",
    dataSources: [...sources],
    verified: Boolean(primary?.verified),
    confidence: Math.max(
      vinLookup?.confidence ?? 0,
      plateLookup?.confidence ?? 0,
      openTa ? 0.7 : 0
    ),
    validation: {
      plausibleVin: isPlausibleVin(vin),
      usChecksumValid: isValidVinChecksum(vin),
      euVinAccepted: isValidVinForLookup(vin),
      isValidVinRelaxed: isValidVin(vin),
    },
  };
}

function buildFallbackDescription(merged: MergedVehicleRecord): {
  title: string;
  description: string;
  confidence: number;
} {
  const taLine =
    merged.taExpiry !== "—"
      ? `Techninė apžiūra galioja iki ${merged.taExpiry}${merged.taValid ? "" : " (patikrinkite statusą)"}.`
      : "Techninės apžiūros galiojimo datą rekomenduojame patikrinti prieš perkant.";
  const mileageLine = merged.mileage
    ? `Paskutinė užfiksuota rida: ${merged.mileage}.`
    : "";

  return {
    title: `${merged.make} ${merged.model} ${merged.year} — patikimas pasirinkimas`,
    description: [
      `Parduodamas ${merged.make} ${merged.model} (${merged.year} m.) su valstybiniu numeriu ${merged.plateNumber}.`,
      `Automobilis identifikuotas pagal VIN ${merged.vin}; duomenys gauti iš atvirų ES/LT registrų.`,
      `${merged.fuelType !== "Nežinoma" ? `Kuro tipas: ${merged.fuelType}.` : ""} ${merged.engine !== "Nežinomas" ? `Variklis: ${merged.engine}.` : ""}`.trim(),
      [mileageLine, taLine].filter(Boolean).join(" "),
      "Automobilis tinkamas kasdieniam naudojimui; kviečiame apžiūrėti ir pasitarti dėl detalių bei kainos.",
    ]
      .filter(Boolean)
      .join(" "),
    confidence: 0.72,
  };
}

async function generateGeminiListing(merged: MergedVehicleRecord): Promise<{
  title: string;
  description: string;
  confidence: number;
  fallbackUsed: boolean;
  error?: string;
}> {
  if (!hasAiKey()) {
    const fb = buildFallbackDescription(merged);
    return { ...fb, fallbackUsed: true, error: "GEMINI_API_KEY not configured" };
  }

  const prompt = `Tu esi profesionalus lietuviškų automobilių skelbimų rašytojas portale vAuto.lt.
Remdamasis TIK žemiau pateiktais patvirtintais duomenimis (neišgalvok papildomų faktų), sugeneruok patrauklų skelbimą.

Duomenys:
${JSON.stringify(merged, null, 2)}

Reikalavimai:
- title: trumpa, patraukli antraštė lietuviškai (markė, modelis, metai)
- description: 5–8 sakiniai, profesionalus tonas, be emoji, pabrėžk naudą pirkėjui
- Jei TA data ar rida žinoma — būtinai įtrauk
- Jei kuro tipas/variklis nežinomi — neįvardink konkrečių skaičių
- confidence: 0.0–1.0 pagal duomenų pilnumą

Grąžink JSON: { "title": "string", "description": "string", "confidence": number }`;

  try {
    const raw = await unifiedLlmJson({
      prompt,
      systemInstruction:
        "Grąžink tik vieną JSON objektą su laukais title, description, confidence. Jokio markdown.",
    });
    const title = String(raw.title ?? "").trim();
    const description = String(raw.description ?? "").trim();
    const confidence = Math.min(1, Math.max(0, Number(raw.confidence) || 0.85));
    if (!title || !description) throw new Error("Empty title or description from Gemini");
    return { title, description, confidence, fallbackUsed: false };
  } catch (e) {
    const fb = buildFallbackDescription(merged);
    return {
      ...fb,
      fallbackUsed: true,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function runCitroenDs5E2eTest(): Promise<E2eTestOutput> {
  const ocr = simulateOcrFromPhotoLines(SIMULATED_OCR_LINES);
  const plate = ocr.extractedPlate ?? PLATE_RAW;
  const vin = ocr.extractedVin ?? VIN_RAW;

  const [lookupByVin, lookupByPlate, openTa] = await Promise.all([
    lookupVehicleOnServer(vin, { plate }),
    lookupVehicleOnServer(plate, { vin }),
    lookupLtOpenData(plate, vin),
  ]);

  const mergedBase = mergeVehicleRecords(ocr, lookupByVin, lookupByPlate, openTa);
  const merged = enrichFromOcrLines(mergedBase, ocr.lines);
  const geminiResult = await generateGeminiListing(merged);

  return {
    testId: "citroen-ds5-nog675-vf7-e2e",
    timestamp: new Date().toISOString(),
    ocr,
    lookupByVin,
    lookupByPlate,
    merged,
    gemini: {
      available: hasAiKey(),
      title: geminiResult.title,
      description: geminiResult.description,
      confidence: geminiResult.confidence,
      error: geminiResult.error,
      fallbackUsed: geminiResult.fallbackUsed,
    },
  };
}

async function main() {
  console.log("=".repeat(72));
  console.log("VAUTO E2E — Citroën DS5 (OCR → lookup → merge → Gemini)");
  console.log("=".repeat(72));

  const result = await runCitroenDs5E2eTest();

  console.log("\n--- FINAL JSON ---\n");
  console.log(JSON.stringify(result, null, 2));

  console.log("\n--- AI APRAŠYMAS (vartotojui) ---\n");
  console.log(`Antraštė: ${result.gemini.title}`);
  console.log(`\n${result.gemini.description}`);
  if (result.gemini.fallbackUsed) {
    console.log(
      `\n[PASTABA: ${result.gemini.available ? "Gemini klaida" : "Gemini API raktas nerastas"} — naudotas struktūruotas fallback]`
    );
  }

  const missing: string[] = [];
  if (!result.merged.mileage) missing.push("rida");
  if (result.merged.taExpiry === "—") missing.push("TA galiojimo data");
  if (missing.length) {
    console.log(
      `\n[TRŪKSTA iš atvirų šaltinių: ${missing.join(", ")} — Transeksta/Regitra vieši API pagal tik numerį negrąžino]`
    );
  }
}

const isDirectRun = process.argv[1]?.includes("vehicle-e2e-citroen-ds5");
if (isDirectRun) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
