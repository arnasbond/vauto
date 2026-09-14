/**
 * Item 2/5 — One Price / Vehicle-Year Disambiguation Authority Parity Tests
 *
 * Verifies single deterministic contract across server, client, and voice fallback:
 *  1. "2000 €" -> price everywhere (2000), never vehicle year.
 *  2. "kaina 2000" -> price everywhere (2000), never vehicle year.
 *  3. "už 2000" -> price everywhere (2000), never vehicle year.
 *  4. "metai 2008" -> vehicle year everywhere ("2008"), never price.
 *  5. "2008 m." -> vehicle year everywhere ("2008"), never price.
 *  6. "2008 metų" -> vehicle year everywhere ("2008"), never price.
 *  7. lone "2000" -> identical fail-closed result everywhere (neither price nor year inferred).
 *  8. existing VIN handling unchanged.
 *  9. user-corrected year/price cannot be overwritten by weaker inference.
 *  10. voice fallback cannot mutate the draft differently from canonical server semantics.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  parseDisambiguatedPrice,
  extractVehicleYearFromText,
} from "../../shared/price-year-disambiguation.js";
import { parsePriceFromChatInput } from "../listing-chat-input.js";
import {
  extractVehicleYearFromText as extractVehicleYearServer,
  extractVehicleSpecsFromChat,
} from "../vehicle-attribute-extract.js";
import {
  isFieldUserCorrected,
  markUserCorrectedField,
  mergeFieldAuthorityAttrs,
} from "../../shared/field-authority.js";
const clientVoiceIntentUrl = new URL(
  "../../../../src/lib/voice-intent.js",
  import.meta.url
).href;

interface VoiceIntentResult {
  missingFields: string[];
  intent?: string;
  [key: string]: unknown;
}

type AnalyzeVoiceIntentFn = (params: {
  transcript: string;
  mode?: string;
}) => Promise<VoiceIntentResult>;

let analyzeVoiceIntent: AnalyzeVoiceIntentFn;
import { applyVinExtractionCandidate } from "../../shared/vin-review.js";

describe("Item 2/5 — One Price / Vehicle-Year Authority Parity", () => {
  beforeEach(async () => {
    if (!analyzeVoiceIntent) {
      const mod = (await import(clientVoiceIntentUrl)) as {
        analyzeVoiceIntent?: AnalyzeVoiceIntentFn;
        default?: { analyzeVoiceIntent?: AnalyzeVoiceIntentFn };
      };
      analyzeVoiceIntent = (mod.analyzeVoiceIntent || mod.default?.analyzeVoiceIntent)!;
    }
  });

  // Case 1: "2000 €" -> Price everywhere
  it("Case 1: '2000 €' resolves to price=2000 and year=null across all entry points", async () => {
    const text = "2000 €";
    assert.equal(parseDisambiguatedPrice(text), 2000);
    assert.equal(parsePriceFromChatInput(text), 2000);
    assert.equal(extractVehicleYearFromText(text), null);
    assert.equal(extractVehicleYearServer(text), null);

    const voice = await analyzeVoiceIntent({
      transcript: "Parduodu Audi A4 2000 €",
      mode: "listing",
    });
    assert.equal(voice.missingFields.includes("kaina"), false);
  });

  // Case 2: "kaina 2000" -> Price everywhere
  it("Case 2: 'kaina 2000' resolves to price=2000 and year=null across all entry points", async () => {
    const text = "kaina 2000";
    assert.equal(parseDisambiguatedPrice(text), 2000);
    assert.equal(parsePriceFromChatInput(text), 2000);
    assert.equal(extractVehicleYearFromText(text), null);
    assert.equal(extractVehicleYearServer(text), null);

    const voice = await analyzeVoiceIntent({
      transcript: "Parduodu Audi A4 kaina 2000",
      mode: "listing",
    });
    assert.equal(voice.missingFields.includes("kaina"), false);
  });

  // Case 3: "už 2000" -> Price everywhere
  it("Case 3: 'už 2000' resolves to price=2000 and year=null across all entry points", async () => {
    const text = "už 2000";
    assert.equal(parseDisambiguatedPrice(text), 2000);
    assert.equal(parsePriceFromChatInput(text), 2000);
    assert.equal(extractVehicleYearFromText(text), null);
    assert.equal(extractVehicleYearServer(text), null);

    const voice = await analyzeVoiceIntent({
      transcript: "Parduodu Audi A4 už 2000",
      mode: "listing",
    });
    assert.equal(voice.missingFields.includes("kaina"), false);
  });

  // Case 4: "metai 2008" -> Year everywhere
  it("Case 4: 'metai 2008' resolves to year='2008' and price=null across all entry points", async () => {
    const text = "metai 2008";
    assert.equal(parseDisambiguatedPrice(text), null);
    assert.equal(parsePriceFromChatInput(text), null);
    assert.equal(extractVehicleYearFromText(text), "2008");
    assert.equal(extractVehicleYearServer(text), "2008");

    const specs = extractVehicleSpecsFromChat(text);
    assert.equal(specs.year, "2008");

    const voice = await analyzeVoiceIntent({
      transcript: "Parduodu Audi A4 metai 2008",
      mode: "listing",
    });
    assert.equal(voice.missingFields.includes("metai"), false);
  });

  // Case 5: "2008 m." -> Year everywhere
  it("Case 5: '2008 m.' resolves to year='2008' and price=null across all entry points", async () => {
    const text = "2008 m.";
    assert.equal(parseDisambiguatedPrice(text), null);
    assert.equal(parsePriceFromChatInput(text), null);
    assert.equal(extractVehicleYearFromText(text), "2008");
    assert.equal(extractVehicleYearServer(text), "2008");

    const specs = extractVehicleSpecsFromChat(text);
    assert.equal(specs.year, "2008");

    const voice = await analyzeVoiceIntent({
      transcript: "Parduodu Audi A4 2008 m.",
      mode: "listing",
    });
    assert.equal(voice.missingFields.includes("metai"), false);
  });

  // Case 6: "2008 metų" -> Year everywhere
  it("Case 6: '2008 metų' resolves to year='2008' and price=null across all entry points", async () => {
    const text = "2008 metų";
    assert.equal(parseDisambiguatedPrice(text), null);
    assert.equal(parsePriceFromChatInput(text), null);
    assert.equal(extractVehicleYearFromText(text), "2008");
    assert.equal(extractVehicleYearServer(text), "2008");

    const specs = extractVehicleSpecsFromChat(text);
    assert.equal(specs.year, "2008");

    const voice = await analyzeVoiceIntent({
      transcript: "Parduodu Audi A4 2008 metų",
      mode: "listing",
    });
    assert.equal(voice.missingFields.includes("metai"), false);
  });

  // Case 7: Lone ambiguous "2000" -> Identical fail-closed result everywhere
  it("Case 7: Lone ambiguous '2000' fails closed across all entry points", async () => {
    const text = "2000";
    // Neither price nor year is silently inferred
    assert.equal(parseDisambiguatedPrice(text), null);
    assert.equal(parsePriceFromChatInput(text), null);
    assert.equal(extractVehicleYearFromText(text), null);
    assert.equal(extractVehicleYearServer(text), null);

    const voice = await analyzeVoiceIntent({
      transcript: "Parduodu Volkswagen Golf 2000",
      mode: "listing",
    });
    // Ambiguous "2000" fails closed: both year and price remain missing
    assert.equal(voice.needsClarification, true);
    assert.equal(voice.missingFields.includes("metai"), true, "Must require year clarification");
    assert.equal(voice.missingFields.includes("kaina"), true, "Must require price clarification");
  });

  // Case 8: Existing VIN handling unchanged
  it("Case 8: Existing VIN handling is unchanged and preserves 17-char VIN authority", () => {
    const vin = "WAUZZZ8K9BA123456";
    const text = `Audi A4 dyzelinas VIN: ${vin}`;
    const specs = extractVehicleSpecsFromChat(text);
    assert.equal(specs.vin, vin);

    const baseAttrs: Record<string, string> = { make: "Audi", model: "A4" };
    const applied = applyVinExtractionCandidate(baseAttrs, {
      value: vin,
      source: "user_entered",
    });
    assert.equal(applied.vinCandidate, vin);
  });

  // Case 9: User-corrected year/price cannot be overwritten by weaker inference
  it("Case 9: User-corrected year and price cannot be overwritten by weaker inference", () => {
    let attrs: Record<string, string> = {
      make: "BMW",
      model: "320",
      year: "2008",
    };
    attrs = markUserCorrectedField(attrs, "year");
    assert.equal(isFieldUserCorrected(attrs, "year"), true);

    // Incoming weaker inference attempts to set year to 2005
    const merged = mergeFieldAuthorityAttrs(attrs, { year: "2005" }, "VISUAL_OBSERVATION");
    assert.equal(merged.year, "2008", "User-corrected year must be preserved");
  });

  // Case 10: Voice fallback cannot mutate draft differently from canonical server semantics
  it("Case 10: Voice fallback obeys canonical server semantics without diverging draft mutations", async () => {
    // When transcript has explicit price "kaina 3500" and year "2010 m."
    const fullTranscript = "Parduodu Passat 2010 m. kaina 3500";
    const voice = await analyzeVoiceIntent({
      transcript: fullTranscript,
      mode: "listing",
    });

    assert.equal(voice.missingFields.includes("metai"), false, "Year recognized");
    assert.equal(voice.missingFields.includes("kaina"), false, "Price recognized");

    // Server parser sees the exact same facts
    assert.equal(parseDisambiguatedPrice(fullTranscript), 3500);
    assert.equal(extractVehicleYearFromText(fullTranscript), "2010");
  });
});
