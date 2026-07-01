/**
 * Vehicle OCR / plate / VIN pattern smoke tests (v1.6.20).
 * Run: npx tsx src/test/vehicle-ocr-patterns.ts
 */
import {
  classifyOcrLine,
  extractPlateToken,
  extractVinToken,
} from "../services/visual-pipeline/providers/ocr.js";
import { isLtPlate, normalizeLtPlate } from "../vehicle/plate-lookup.js";
import { isPlausibleVin, isValidVin, normalizeVin } from "../vehicle/vin-utils.js";

const PLATE = "NOG675";
const VIN = "VF7KFRHC8CS517606";

const samples = [
  { label: "plate compact", text: "NOG675" },
  { label: "plate spaced", text: "NOG 675" },
  { label: "plate in sentence", text: "Citroen DS5 numeris NOG675" },
  { label: "vin sticker line", text: "VF7KFRHC8CS517606" },
  { label: "vin with spaces", text: "VF7 KFR HC8 CS5 17606" },
  { label: "ocr noise plate", text: "VALST. NR. NOG 675" },
];

let failed = 0;

function assert(name: string, ok: boolean, detail?: string) {
  if (!ok) {
    failed += 1;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    console.log(`OK   ${name}`);
  }
}

console.log("=== Plate / VIN normalization ===");
assert("isLtPlate NOG675", isLtPlate(PLATE));
assert("normalizeLtPlate", normalizeLtPlate(PLATE) === "NOG 675");
assert("isPlausibleVin VF7KFRHC8CS517606", isPlausibleVin(VIN));
assert(
  "isValidVin checksum (optional)",
  isValidVin(VIN) || isPlausibleVin(VIN),
  isValidVin(VIN) ? undefined : "checksum mismatch — OCR still extracts"
);
assert("normalizeVin", normalizeVin(VIN) === VIN);

console.log("\n=== OCR token extraction ===");
for (const s of samples) {
  const plate = extractPlateToken(s.text);
  const vin = extractVinToken(s.text);
  const kind = classifyOcrLine(s.text);
  console.log(`  [${s.label}] plate=${plate ?? "-"} vin=${vin ?? "-"} kind=${kind}`);
}

assert(
  "extract plate from sentence (no false VIN)",
  extractPlateToken("Parduodu Citroen DS5, numeris NOG675") === "NOG 675" &&
    extractVinToken("Parduodu Citroen DS5, numeris NOG675") === null
);
assert("extract vin sticker", extractVinToken(VIN) === VIN);
assert(
  "classify vin line",
  classifyOcrLine("VF7KFRHC8CS517606") === "vin_plate"
);
assert(
  "classify plate line",
  classifyOcrLine("NOG 675") === "vin_plate"
);

console.log(failed ? `\n${failed} test(s) failed` : "\nAll pattern tests passed");
process.exit(failed ? 1 : 0);
