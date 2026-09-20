/**
 * R2-H3 — the VAUTO domain boundary must be GOAL-based, not word-based.
 *
 * A buying request ("nupirk sūnui telefoną, nežinau kokio reikėtų") is a
 * marketplace goal and must reach reasoning, even with typos/slang and
 * without an explicit advice verb or recognized product keyword. Conversely,
 * genuinely unrelated goals (homework/coding/creative) remain out-of-domain.
 *
 * These tests assert the deterministic off-domain gate stays NARROW (it must
 * not reject the buying request) and that the prompt-level boundary is
 * goal-based and preserves the general-purpose-AI abuse boundary.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectOffDomainPrompt } from "../safety-shield.js";
import { VAUTO_DOMAIN_AUTONOMY_RULES } from "../../shared/vauto-domain-autonomy.js";
import { GEMINI_SAFETY_SHIELD_RULES } from "../gemini-intent-rules.js";

const PHONE_BUYING = "paprase manes sunus nupirkti telefona ,jam 14 m. nenoriu dugiau kaip 400 isleisti,bet svarbu kad geai laikytu baterija,butu panakamai tvirtas ir patikimas, nezinau kokio reiketu";

describe("R2-H3 — deterministic off-domain gate is NOT a product dictionary", () => {
  it("a buying request (with typos) is NOT rejected off-domain", () => {
    assert.equal(detectOffDomainPrompt(PHONE_BUYING), false, "buying goal is in-domain");
  });

  it("vehicle + real-estate + service buying goals are NOT rejected off-domain", () => {
    assert.equal(detectOffDomainPrompt("nezinau koki automobili rinktis seimai iki 20000"), false);
    assert.equal(detectOffDomainPrompt("ieskau buto Vilniuje iki 150000"), false);
    assert.equal(detectOffDomainPrompt("reikia elektriko namuose"), false);
  });

  it("clearly unrelated goals ARE rejected off-domain", () => {
    assert.equal(detectOffDomainPrompt("parašyk kodą"), true);
    assert.equal(detectOffDomainPrompt("tell me a joke"), true);
    assert.equal(detectOffDomainPrompt("koks oras Vilniuje"), true);
    assert.equal(detectOffDomainPrompt("do my homework"), true);
  });
});

describe("R2-H3 — domain boundary is goal-based, not word-based", () => {
  it("boundary is defined by marketplace goal, with indecision + typo tolerance", () => {
    assert.match(VAUTO_DOMAIN_AUTONOMY_RULES, /RINKOS TIKSLAS/i);
    assert.match(VAUTO_DOMAIN_AUTONOMY_RULES, /nežinau kokio reikėtų/i);
    assert.match(VAUTO_DOMAIN_AUTONOMY_RULES, /klaidomis\/žargonu/i);
  });

  it("boundary preserves the general-purpose-AI abuse protection", () => {
    assert.match(VAUTO_DOMAIN_AUTONOMY_RULES, /NEATRAKINA bendro AI/i);
    assert.match(VAUTO_DOMAIN_AUTONOMY_RULES, /pretekstas/i);
  });

  it("safety shield no longer treats buying advice as 'ne-VAUTO temas'", () => {
    assert.match(GEMINI_SAFETY_SHIELD_RULES, /be RINKOS TIKSLO/i);
    assert.match(GEMINI_SAFETY_SHIELD_RULES, /NEklasifikuok jo kaip „ne-VAUTO temos“/i);
  });
});
