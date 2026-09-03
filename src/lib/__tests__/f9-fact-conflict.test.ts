/**
 * F9 — canonical fact-conflict lifecycle (shared reducer): deterministic
 * A/B resolution, unrelated-turn preservation, semantic equality,
 * fail-closed malformed markers, one typed question, no delimiters.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveFactConflictState,
  readActiveFactConflict,
  buildFactConflictQuestion,
  normalizePriceValue,
  normalizeCityValue,
  normalizeConditionValue,
  extractConditionFromText,
  FACT_CONFLICT_MARKER_KEYS,
} from "@vauto/shared/fact-conflict";

describe("F9 — faktų konfliktų lifecycle", () => {
  it("pirmas patikimas faktas tampa canonical", () => {
    const p = resolveFactConflictState({
      field: "condition",
      priorAttributes: {},
      incomingValue: "naudota",
    });
    assert.deepEqual(p.patch, { condition: "Naudota" });
  });

  it("semantiškai vienoda būklė konflikto nesukuria", () => {
    const p = resolveFactConflictState({
      field: "condition",
      priorAttributes: { condition: "Naudota" },
      incomingValue: "naudotas",
    });
    assert.deepEqual(p.patch, {});
  });

  it("semantiškai vienodas miestas (kaunas/Kaunas) konflikto nesukuria", () => {
    const p = resolveFactConflictState({
      field: "city",
      priorAttributes: { city: "Kaunas" },
      incomingValue: "  kaunas ",
    });
    assert.deepEqual(p.patch, {});
  });

  it("semantiškai vienoda kaina (15 vs 15.00) konflikto nesukuria", () => {
    const p = resolveFactConflictState({
      field: "price",
      priorAttributes: { price: 15 },
      incomingValue: "15,00",
    });
    assert.deepEqual(p.patch, {});
  });

  it("A vs B: A lieka canonical, B tampa candidate", () => {
    const p = resolveFactConflictState({
      field: "city",
      priorAttributes: { city: "Kaunas" },
      incomingValue: "Vilnius",
    });
    assert.deepEqual(p.patch, {
      city: "Kaunas",
      cityConflict: "true",
      cityConflictCandidate: "Vilnius",
    });
  });

  it("nesusijęs turnas (be incoming) aktyvaus konflikto neištrina", () => {
    const prior = { city: "Kaunas", cityConflict: "true", cityConflictCandidate: "Vilnius" };
    const p = resolveFactConflictState({
      field: "city",
      priorAttributes: prior,
      incomingValue: undefined,
    });
    assert.deepEqual(p.patch, {});
  });

  it("vartotojas pasirenka A → markeriai pašalinami, A lieka", () => {
    const prior = { city: "Kaunas", cityConflict: "true", cityConflictCandidate: "Vilnius" };
    const p = resolveFactConflictState({
      field: "city",
      priorAttributes: prior,
      incomingValue: "Kaunas",
    });
    assert.deepEqual(p.patch, { city: "Kaunas", cityConflict: "", cityConflictCandidate: "" });
  });

  it("vartotojas pasirenka B → B tampa canonical, markeriai pašalinami", () => {
    const prior = { city: "Kaunas", cityConflict: "true", cityConflictCandidate: "Vilnius" };
    const p = resolveFactConflictState({
      field: "city",
      priorAttributes: prior,
      incomingValue: "vilnius",
    });
    assert.deepEqual(p.patch, { city: "Vilnius", cityConflict: "", cityConflictCandidate: "" });
  });

  it("trečia C reikšmė konflikto tyliai neišsprendžia", () => {
    const prior = { city: "Kaunas", cityConflict: "true", cityConflictCandidate: "Vilnius" };
    const p = resolveFactConflictState({
      field: "city",
      priorAttributes: prior,
      incomingValue: "Klaipėda",
    });
    assert.deepEqual(p.patch, {
      city: "Kaunas",
      cityConflict: "true",
      cityConflictCandidate: "Vilnius",
    });
  });

  it("malformed markeriai nesuteikia autoriteto (fail-closed)", () => {
    assert.equal(
      readActiveFactConflict({ city: "Kaunas", cityConflict: "yes", cityConflictCandidate: "Vilnius" }),
      null
    );
    assert.equal(
      readActiveFactConflict({ city: "Kaunas", cityConflict: "true", cityConflictCandidate: "" }),
      null
    );
    assert.equal(
      readActiveFactConflict({ cityConflict: "true", cityConflictCandidate: "Vilnius" }),
      null
    );
    assert.equal(
      readActiveFactConflict({
        city: "Kaunas",
        cityConflict: "true",
        cityConflictCandidate: "x".repeat(300),
      }),
      null
    );
  });

  it("klausimas formuojamas iš tipuotų reikšmių — jokių duomenų delimiterių", () => {
    const c = readActiveFactConflict({
      price: 15,
      priceConflict: "true",
      priceConflictCandidate: "999",
    });
    assert.ok(c);
    const q = buildFactConflictQuestion(c);
    assert.match(q, /kainą/);
    assert.match(q, /999/);
    assert.match(q, /15/);
    // No serialized data separators or JSON blobs — prose only.
    assert.doesNotMatch(q, /\|/);
    assert.doesNotMatch(q, /\{/);
    assert.doesNotMatch(q, /"pending"/);
  });

  it("normalizatoriai atmeta NaN/Infinity/negative/oversized", () => {
    assert.equal(normalizePriceValue(NaN), undefined);
    assert.equal(normalizePriceValue(Infinity), undefined);
    assert.equal(normalizePriceValue(-1), undefined);
    assert.equal(normalizePriceValue(100_000_001), undefined);
    assert.equal(normalizePriceValue(15), 15);
    assert.equal(normalizeCityValue("x".repeat(121)), undefined);
    assert.equal(normalizeCityValue(" Kaunas "), "Kaunas");
    assert.equal(normalizeConditionValue(""), undefined);
    assert.equal(normalizeConditionValue("randomžodis"), undefined);
    assert.equal(extractConditionFromText("prekė naudota, puiki"), "Naudota");
    assert.equal(extractConditionFromText("visiškai naujas daiktas"), "Nauja");
    assert.equal(extractConditionFromText("be jokios būklės žodžio"), undefined);
  });

  it("visi šeši markeriai yra žinomi ir deterministiniai", () => {
    assert.deepEqual([...FACT_CONFLICT_MARKER_KEYS].sort(), [
      "cityConflict",
      "cityConflictCandidate",
      "conditionConflict",
      "conditionConflictCandidate",
      "priceConflict",
      "priceConflictCandidate",
    ].sort());
  });
});
