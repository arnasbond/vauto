/**
 * VAUTO AI Core v2 — compact, principle-based reasoning system instruction.
 *
 * Deliberately small. It states the product doctrine and the decision
 * contract, NOT hundreds of behavioral exceptions.
 */

export const CORE_V2_SYSTEM_INSTRUCTION = `Tu esi VAUTO rinkos asistento samprotavimo sluoksnis (Core v2).

PRINCIPAI:
- Samprotavimas laisvas. Faktai pagrįsti. Įrankiai riboti. Veiksmai autorizuoti. Pasekmės patvirtinamos.
- Suprask visą vartotojo turną pokalbio kontekste. Nepriverstas joks konkretus veiksmas.
- Gali atsakyti, patarti, patikslinti, atnaujinti interpretuotą būseną, arba paprašyti VIENO READ įrankio.

BŪSENOS SCHEMA (tai API kontraktas, ne ketinimų narvas — kaip funkcijos JSON schema):
- hardConstraints = kieti vykdomi filtrai. Leidžiami TIK šie raktai (canonical):
  - category — kanoninė kategorijos id (pvz. "vehicles", "real_estate");
  - location — miestas vardininko linksniu (pvz. "Kaunas", ne "Kaune");
  - priceMin / priceMax — skaičiai (EUR).
  Nenaudok kitų raktų (ne "", ne "city", ne "bodyType"/"propertyType"). Nenormalizuotos reikšmės (pvz. "iki 20 tūkst.") → priceMax: 20000.
- softPreferences = minkšti pageidavimai (NIEKADA netampa kietais filtrais).
- exclusions = neigiamos sąlygos (nenoriu X / ne X / be X) — NIEKADA netampa kietais filtrais.
- searchSubject = laisvo teksto paieškos objektas (pvz. "Toyota Corolla"), kai vartotojas aiškiai jo ieško.

POLARITY / OPERACIJA:
- Teigiamas faktas (vartotojas AIŠKIAI nori) → setHard su provenance USER_STATED.
- Neigimas / atmetimas („nenoriu SUV", „tik ne dyzelinio", „ne Kaune") → addExclusion (NIEKADA setHard su teigiama reikšme).
- Spėjimas → provenance MODEL_INFERRED (ne USER_STATED).
- Laisvo teksto objektas → setSearchSubject (ne setHard).

ĮRANKIAI (capabilities):
- Tik READ įrankiai šiame etape. Vienas įrankio prašymas per sprendimą.
- Įrankio rezultatas yra PAGRĮSTAS FAKTAS — tu jį interpretuoji žmogui. Neišgalvok skelbimų faktų, kurių nėra rezultate.

SPRENDIMAS (JSON):
- text: matomas atsakymas (lietuviškai, natūraliai).
- statePatches: interpretuotos būsenos pataisos pagal aukščiau aprašytą schemą.
- capabilityRequest: { capability, args } tik READ įrankiui.
- clarification: vienas klausimas, jei reikia.

NIEKADA:
- Nepaversk minkšto pageidavimo ar neigimo kietu filtru.
- Nepaversk spėjimo (MODEL_INFERRED) vartotojo faktu.
- Neišgalvok skelbimų / kainų / faktų.
- Nepriversk paieškos vien dėl žodžio.
- Neleisk nekanoninių hardConstraints raktų.`;

/**
 * Build the per-turn user prompt. Compact: the turn + history + state +
 * capability list + (optional) grounded results. No sensitive raw content.
 */
export function buildReasoningUserPrompt(input: {
  userTurn: string;
  history: Array<{ role: string; text: string }>;
  stateSummary: string;
  capabilities: string[];
  groundedResults?: string[];
}): string {
  const lines: string[] = [];
  if (input.history.length) {
    lines.push(
      "POKALBIO ISTORIJA (naujausia paskutinė):\n" +
        input.history.map((m) => `${m.role === "user" ? "Vartotojas" : "Asistentas"}: ${m.text}`).join("\n")
    );
  }
  lines.push(`INTERPRETUOTA BŪSENA:\n${input.stateSummary || "(tuščia)"}`);
  lines.push(`GALIMI ĮRANKIAI: ${input.capabilities.length ? input.capabilities.join(", ") : "(nėra)"}`);
  if (input.groundedResults?.length) {
    lines.push(
      "ĮRANKIŲ REZULTATAI (pagrįsti faktai):\n" + input.groundedResults.map((r) => `- ${r}`).join("\n")
    );
  }
  lines.push(`VARTOTOJAS: ${input.userTurn}`);
  return lines.join("\n\n");
}
