import {
  extractBarcodesFromText,
  isValidBarcode,
  normalizeBarcode,
} from "../product/barcode-utils.js";
import { extractPlateToken, extractVinToken } from "../services/visual-pipeline/providers/ocr.js";
import {
  VISUAL_PIPELINE_FIXTURES,
  type VisualPipelineFixture,
} from "./visual-pipeline-fixtures.js";

export interface VisualPipelineQaResult {
  id: string;
  ok: boolean;
  errors: string[];
  hints: Record<string, string>;
}

function buildHintsFromText(mergedText: string, codes: string[]): Record<string, string> {
  const hints: Record<string, string> = {};
  const lines = mergedText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const vin = lines.map(extractVinToken).find((v): v is string => Boolean(v));
  const plate = lines.map(extractPlateToken).find((v): v is string => Boolean(v));
  const barcodes = extractBarcodesFromText(mergedText);
  const barcode =
    barcodes[0] ??
    codes
      .map((c) => (isValidBarcode(c) ? normalizeBarcode(c) : null))
      .find((c): c is string => Boolean(c));
  if (barcode) hints.barcode = barcode;
  if (vin) hints.vin = vin;
  if (plate) hints.plateNumber = plate;
  return hints;
}

export function runVisualPipelineFixture(
  fixture: VisualPipelineFixture
): VisualPipelineQaResult {
  const errors: string[] = [];
  const codes = extractBarcodesFromText(fixture.mergedText);
  const hints = buildHintsFromText(fixture.mergedText, codes);

  if (fixture.expectVin && hints.vin !== fixture.expectVin) {
    errors.push(`expected vin ${fixture.expectVin}, got ${hints.vin ?? "none"}`);
  }
  if (fixture.expectPlate && hints.plateNumber !== fixture.expectPlate) {
    errors.push(
      `expected plate ${fixture.expectPlate}, got ${hints.plateNumber ?? "none"}`
    );
  }
  if (fixture.expectBarcode) {
    const got = hints.barcode;
    if (!got || normalizeBarcode(got) !== normalizeBarcode(fixture.expectBarcode)) {
      errors.push(`expected barcode ${fixture.expectBarcode}, got ${got ?? "none"}`);
    }
  }

  return { id: fixture.id, ok: errors.length === 0, errors, hints };
}

export function runVisualPipelineQaSuite(): {
  passed: number;
  failed: number;
  results: VisualPipelineQaResult[];
} {
  const results = VISUAL_PIPELINE_FIXTURES.map(runVisualPipelineFixture);
  const passed = results.filter((r) => r.ok).length;
  return { passed, failed: results.length - passed, results };
}
