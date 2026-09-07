/**
 * E2.8 FINAL — advisory reply suppression regression.
 *
 * A legitimate META/ADVISORY/model answer must never disappear merely because
 * it begins with "Šiuo metu…" or contains "neradau". Suppression depends on
 * structured zero-result sentence markers, not broad natural-language fragments.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isBlockedFallbackBubble } from "@/lib/agent-chat-layout";
import { resolveAgentChatReply } from "@/lib/agent-chat-reply";

describe("E2.8 FINAL — isBlockedFallbackBubble (structured zero-result only)", () => {
  it("legitimate advisory/meta answers are never blocked by surface wording", () => {
    for (const text of [
      "Šiuo metu galiu patarti — rekomenduoju žiūrėti Volvo arba Toyota iki 20 tūkst.",
      "Šiuo metu neradau konkrečių variantų, bet galiu patarti, kaip ieškoti.",
      "Rinkoje neradau tikslių atitikmenų — ar norėtumėte platesnių kriterijų?",
      "Deja, tikslaus atsakymo neturiu, bet galiu rekomenduoti kriterijus.",
      "Galiu padėti — neradau jokios klaidos.",
    ]) {
      assert.equal(isBlockedFallbackBubble(text), false, text);
    }
  });

  it("raw legacy zero-result bubbles are still suppressed", () => {
    for (const text of [
      "Šiuo metu skelbimų pagal užklausą „parodyti butus Vilnius“ neradome.",
      "Deja, pagal šiuos kriterijus nieko tinkamo neradau.",
      "Pabandykime kitą frazę — rezultatų nerasta.",
    ]) {
      assert.equal(isBlockedFallbackBubble(text), true, text);
    }
  });

  it("empty-search wishlist CTA is never suppressed", () => {
    const cta =
      "Šiuo metu skelbimų pagal „butai Vilnius“ neradome.\nĮjunkite „Laukiu šio daikto“ — pranešime, kai atsiras.";
    assert.equal(isBlockedFallbackBubble(cta), false);
  });

  it("empty text is treated as a fallback bubble", () => {
    assert.equal(isBlockedFallbackBubble("   "), true);
  });
});

describe("E2.8 FINAL — resolveAgentChatReply renders advisory verbatim", () => {
  it("advisory (actions none) returns the model answer even if it begins with 'Šiuo metu'", () => {
    const reply = resolveAgentChatReply({
      serverReply: "Šiuo metu galiu patarti — pradėkite nuo biudžeto ir kėbulo tipo.",
      actions: { type: "none" },
      userQuery: "Ar verta ieškoti Kia Sportage iki 20000 eurų?",
    });
    assert.match(reply, /galiu patarti/);
    assert.doesNotMatch(reply, /Atlikta\.$/);
  });

  it("meta (actions none) with 'neradau' wording still renders", () => {
    const reply = resolveAgentChatReply({
      serverReply: "Neradau jokios klaidos — esu VAUTO asistentas, galiu padėti su skelbimais ir paieška.",
      actions: { type: "none" },
      userQuery: "Ką tu gali?",
    });
    assert.match(reply, /VAUTO|galiu padėti/i);
  });
});
