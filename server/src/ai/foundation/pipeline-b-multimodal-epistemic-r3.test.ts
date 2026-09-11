/**
 * R3.1 — multimodal epistemic grounding + provenance enforcement.
 *
 * The vision/media surfaces (chat media upload, structured input, SEO metadata,
 * buyer photo-search, wardrobe) must obey the SAME epistemic + human-authority
 * doctrine as the certified text path:
 *   FACT → SUPPORTED INFERENCE → UNKNOWN, and AI proposes / human confirms.
 *
 * This closes the R3 split-brain: legacy "MASTER SALES COPYWRITER / turtingas /
 * engaginantis" doctrine still shipped in four production vision surfaces, and
 * the agent chat vision path dropped MODEL_INFERENCE lineage when it deferred a
 * description — letting vision prose publish as if it were manual content.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  VISION_NATURAL_GROUNDED_COPY_RULE,
  VISION_EXTRACTION_ANTI_HALLUCINATION_RULE,
} from "../vision-guardrails.js";
import { ensureRichSalesCopyBeforePublish } from "../../shared/ensure-rich-sales-copy.js";
import {
  signModelInferenceProposal,
  signHumanConfirmedDescription,
  resolveDescriptionPublishDecision,
} from "../../shared/description-provenance.js";

const KEY = "r3-multimodal-signing-key";

// Every production-reachable multimodal prompt surface (server source files).
const MULTIMODAL_PROMPT_FILES = [
  "../vision-guardrails.ts",
  "../chat-media-upload.ts",
  "../structured-input-pipeline.ts",
  "../gemini-intent-rules.ts",
  "../image-metadata-generator.ts",
  "../search-intent.ts",
];

function readSource(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

const RETIRED_DOCTRINE = /MASTER SALES COPYWRITER|turtingas|turtingą|engaginant/i;

describe("R3.1-A — production multimodal prompts drop the retired creative doctrine", () => {
  it("no production multimodal prompt source ships the retired doctrine", () => {
    for (const rel of MULTIMODAL_PROMPT_FILES) {
      const src = readSource(rel);
      assert.ok(!RETIRED_DOCTRINE.test(src), `${rel} must not ship retired doctrine`);
    }
  });

  it("vision grounded-copy rule keeps style freedom but grounds every claim", () => {
    assert.ok(!RETIRED_DOCTRINE.test(VISION_NATURAL_GROUNDED_COPY_RULE));
    assert.match(VISION_NATURAL_GROUNDED_COPY_RULE, /fakt/i, "must reference facts");
    assert.match(VISION_NATURAL_GROUNDED_COPY_RULE, /neišgalvok|NEišgalvok/i, "must forbid invention");
    // Supported inference remains an evidence class — vision is NOT reduced to literal OCR.
    assert.match(VISION_NATURAL_GROUNDED_COPY_RULE, /IŠVADA/i, "must allow supported inference");
    assert.match(VISION_NATURAL_GROUNDED_COPY_RULE, /vaizdo|OCR|vartotojo/i, "must name evidence classes");
  });

  it("vision extraction rule remains fact-only (Pass-1 grounding intact)", () => {
    assert.match(VISION_EXTRACTION_ANTI_HALLUCINATION_RULE, /fakt/i);
    assert.match(VISION_EXTRACTION_ANTI_HALLUCINATION_RULE, /neišgalvok|NEišgalvok|nespėliok/i);
  });
});

describe("R3.1-B/C — deferral + materialization cannot erase AI lineage", () => {
  const prose =
    "Parduodamas puikios būklės iPhone 13 Pro 256 GB, grafito spalvos. " +
    "Telefonas veikia nepriekaištingai, baterijos būklė 88 %, be įbrėžimų ant ekrano. " +
    "Komplekte dėžutė, laidas ir apsauginis dėklas.";

  it("deferred MODEL_INFERENCE vision prose materializes with valid provenance", () => {
    const token = signModelInferenceProposal(prose, KEY);
    const draft = {
      title: "iPhone 13 Pro 256 GB",
      description: "",
      price: 0,
      location: "Vilnius",
      category: "electronics",
      attributes: {
        deferredSalesDescription: prose,
        deferredSalesDescriptionSource: "MODEL_INFERENCE",
        deferredSalesDescriptionProvenanceToken: token,
        salesCopyGenerated: "false",
      },
    };

    const out = ensureRichSalesCopyBeforePublish(draft);

    assert.equal(out.description, prose, "materializes the deferred prose");
    const attrs = out.attributes as Record<string, string>;
    assert.equal(attrs.descriptionSource, "MODEL_INFERENCE");
    assert.ok(attrs.provenanceToken, "provenance token must be present");
    // Materialization re-mints with the server signing key (same key the publish
    // boundary uses when no explicit key is supplied).
    assert.equal(
      resolveDescriptionPublishDecision(out.description!, attrs.provenanceToken, undefined),
      "reject_unpromoted",
      "materialized vision prose must remain an unpromoted AI proposal"
    );
  });

  it("a fresh materialization token binds the EXACT final text (no stale token)", () => {
    const draft = {
      title: "iPhone",
      description: "",
      price: 0,
      location: "Vilnius",
      category: "electronics",
      attributes: {
        deferredSalesDescription: prose,
        deferredSalesDescriptionSource: "MODEL_INFERENCE",
        deferredSalesDescriptionProvenanceToken: signModelInferenceProposal("stale text", KEY),
        salesCopyGenerated: "false",
      },
    };

    const out = ensureRichSalesCopyBeforePublish(draft);
    const attrs = out.attributes as Record<string, string>;
    assert.equal(
      resolveDescriptionPublishDecision(out.description!, attrs.provenanceToken, undefined),
      "reject_unpromoted"
    );
  });
});

describe("R3.1-D — publish boundary treats vision prose identically to text prose", () => {
  const visionProse =
    "Parduodamas šiltas rudas megztinis, dydis L, labai geros būklės, be dėmių. " +
    "Medžiaga minkšta, tinka rudeniui ir žiemai, iš nerūkančių namų.";

  it("unconfirmed vision description → reject_unpromoted", () => {
    const token = signModelInferenceProposal(visionProse, KEY);
    assert.equal(
      resolveDescriptionPublishDecision(visionProse, token, undefined, KEY),
      "reject_unpromoted"
    );
  });

  it("explicitly confirmed exact vision description → accept", () => {
    const conf = signHumanConfirmedDescription(visionProse, KEY);
    assert.equal(
      resolveDescriptionPublishDecision(visionProse, undefined, conf, KEY),
      "accept"
    );
  });

  it("edit after confirmation invalidates (reconfirmation required)", () => {
    const conf = signHumanConfirmedDescription(visionProse, KEY);
    assert.equal(
      resolveDescriptionPublishDecision(visionProse + " (pataisyta)", undefined, conf, KEY),
      "reject_invalid"
    );
  });
});

describe("R3.1-E/F — cross-modality authority model + manual path", () => {
  it("text and vision origin share ONE authority decision (no modality fork)", () => {
    // A MODEL_INFERENCE description resolves identically regardless of origin:
    // the decision function has no modality parameter.
    const textToken = signModelInferenceProposal("AI tekstinis aprašymas.", KEY);
    const visionToken = signModelInferenceProposal("AI vaizdinis aprašymas.", KEY);
    assert.equal(resolveDescriptionPublishDecision("AI tekstinis aprašymas.", textToken, undefined, KEY), "reject_unpromoted");
    assert.equal(resolveDescriptionPublishDecision("AI vaizdinis aprašymas.", visionToken, undefined, KEY), "reject_unpromoted");
  });

  it("genuine manual description stays valid (not forced through AI confirmation)", () => {
    const draft = {
      title: "Rankinis skelbimas",
      description: "Mano paties parašytas aprašymas.",
      price: 0,
      location: "",
      category: "other",
      attributes: {},
    };
    const out = ensureRichSalesCopyBeforePublish(draft);
    const attrs = out.attributes as Record<string, string>;
    assert.equal(attrs.descriptionSource, undefined);
    assert.equal(attrs.provenanceToken, undefined);
    assert.equal(
      resolveDescriptionPublishDecision(out.description!, attrs.provenanceToken, undefined, KEY),
      "accept"
    );
  });

  it("deferred grounded (USER_CLAIM) prose is NOT relabeled as AI inference", () => {
    const grounded =
      "Parduodamas stalas, ąžuolas, 120x80 cm, geros būklės, stovi Vilniuje, kaina derinama.";
    const draft = {
      title: "Ąžuolinis stalas",
      description: "",
      price: 0,
      location: "Vilnius",
      category: "home",
      attributes: {
        deferredSalesDescription: grounded,
        deferredSalesDescriptionSource: "USER_CLAIM",
        salesCopyGenerated: "false",
      },
    };
    const out = ensureRichSalesCopyBeforePublish(draft);
    const attrs = out.attributes as Record<string, string>;
    assert.equal(attrs.descriptionSource, undefined, "USER_CLAIM must not become MODEL_INFERENCE");
    assert.equal(attrs.provenanceToken, undefined);
    assert.equal(
      resolveDescriptionPublishDecision(out.description!, attrs.provenanceToken, undefined, KEY),
      "accept"
    );
  });

  it("deterministic vehicle benchmark copy is NOT stamped as model inference", () => {
    const draft = {
      title: "Volvo V70",
      description: "",
      price: 2500,
      location: "Kaunas",
      category: "vehicles",
      attributes: {
        make: "Volvo",
        model: "V70",
        year: "2006",
        deferredSalesDescription:
          "Parduodamas Volvo V70 2006, dyzelinis variklis, 2000 l, rankinė pavarų dėžė, geros būklės.",
        deferredSalesDescriptionSource: "MODEL_INFERENCE",
        salesCopyGenerated: "false",
      },
    };
    const out = ensureRichSalesCopyBeforePublish(draft);
    const attrs = out.attributes as Record<string, string>;
    assert.equal(attrs.descriptionSource, undefined, "vehicle benchmark is deterministic, not AI prose");
    assert.equal(attrs.provenanceToken, undefined);
  });
});
