/**
 * E2.1 — OPEN-DOMAIN generalization gate.
 *
 * 32 natural dialog phrases that appear in NEITHER the 32 golden scenarios
 * NOR the paraphrase suite. The invariant: NONE of them may turn into a
 * catalog search or publish anything — unclear intent is dialog/clarify,
 * never `searchListings`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runGoldenScenario } from "../harness/golden-simulator.js";
import type { GoldenScenario } from "../harness/golden-types.js";
import { round, text } from "../harness/scripted-model-provider.js";

interface OpenDomainCase {
  phrase: string;
  /** Scripted model answer (the neutral reference dialog reply). */
  scripted: string;
  /** Fragment the reply must mention (from the scripted answer). */
  mention?: string;
}

const OPEN_DOMAIN: OpenDomainCase[] = [
  { phrase: "Sveiki", scripted: "Sveiki! Kaip galiu padėti su skelbimu ar paieška?", mention: "sveiki" },
  { phrase: "Ką tu gali?", scripted: "Galiu padėti parduoti daiktus, ieškoti skelbimų, vertinti kainas ir vesti pokalbį.", mention: "parduoti" },
  { phrase: "Padėk man", scripted: "Žinoma — nuo ko pradėsime? Pardavimas ar paieška?", mention: "pardavimas" },
  { phrase: "Nežinau nuo ko pradėti", scripted: "Pradėkime paprastai: norite ką nors parduoti ar ieškote pirkinio?", mention: "parduoti" },
  { phrase: "Ką rekomenduotum?", scripted: "Galiu rekomenduoti pradėti nuo to, ko šiuo metu reikia labiausiai.", mention: "rekomenduoti" },
  { phrase: "Man reikia patarimo", scripted: "Žinoma — papasakokite daugiau apie savo situaciją.", mention: "papasakokite" },
  { phrase: "Kodėl šitas variantas geresnis?", scripted: "Geras klausimas — palyginkime abu variantus pagal kainą ir būklę.", mention: "palyginkime" },
  { phrase: "Grįžkim prie to, ką kalbėjom", scripted: "Grįžtame — priminkite, apie ką konkrečiai kalbėjome?", mention: "priminkite" },
  { phrase: "Pamiršk paskutinį pakeitimą", scripted: "Gerai — jei turite juodraštį, galiu atšaukti paskutinį pakeitimą.", mention: "atšaukti" },
  { phrase: "Aš persigalvojau", scripted: "Supratau — ką norėtumėte keisti?", mention: "keisti" },
  { phrase: "Gal geriau neparduoti?", scripted: "Gali būti — papasakokite, kodėl abejojate?", mention: "abejojate" },
  { phrase: "Kiek realiai vertas mano telefonas?", scripted: "Padėkite įvertinti: koks modelis, metai ir būklė?", mention: "modelis" },
  { phrase: "Labas, kaip sekasi?", scripted: "Labas! Sekasi puikiai — kuo galiu padėti?", mention: "labas" },
  { phrase: "Ačiū už pagalbą", scripted: "Visada prašom! Jei reikės — aš čia.", mention: "prašom" },
  { phrase: "Kaip man čia viskas veikia?", scripted: "Trumpai: parašykite, ko norite, o aš padėsiu parduoti arba rasti.", mention: "parašykite" },
  { phrase: "Ar gali man patarti?", scripted: "Žinoma — papasakokite situaciją ir patarsiu geriausią kelią.", mention: "patarsiu" },
  { phrase: "Nesu tikras, ko noriu", scripted: "Nieko tokio — užduosiu porą klausimų ir apsispręsime kartu.", mention: "klausimų" },
  { phrase: "Kas naujo turguje?", scripted: "Galiu parodyti, kas dabar populiaru, arba paieškoti konkretaus daikto.", mention: "populiaru" },
  { phrase: "Paaiškink paprasčiau", scripted: "Žinoma — paprastais žodžiais: apie ką norite sužinoti?", mention: "paprastais" },
  { phrase: "Ką daryti toliau?", scripted: "Toliau galime patikslinti detales arba pereiti prie kito žingsnio.", mention: "patikslinti" },
  { phrase: "Ar tu tikras dėl to?", scripted: "Geras klausimas — pažiūrėkime faktus dar kartą.", mention: "faktus" },
  { phrase: "Papasakok daugiau", scripted: "Mielai — apie ką konkrečiai norite sužinoti daugiau?", mention: "konkrečiai" },
  { phrase: "Noriu gero varianto, bet nežinau kokio", scripted: "Padėsiu išsirinkti: papasakokite, kam daiktas reikalingas ir koks biudžetas.", mention: "biudžetas" },
  { phrase: "Padėk išsirinkti", scripted: "Žinoma — kokio daikto ieškote ar kokį norite parduoti?", mention: "ieškote" },
  { phrase: "Kokia tavo nuomonė?", scripted: "Mano nuomonė: pradėkime nuo aiškaus tikslo, tada viskas paprasčiau.", mention: "nuomonė" },
  { phrase: "Man reikia pagalbos su skelbimu", scripted: "Padėsiu — kokį daiktą norite skelbti?", mention: "skelbti" },
  { phrase: "Pradėkim iš naujo", scripted: "Gerai, pradedame iš naujo — koks pirmas žingsnis?", mention: "pradedame" },
  { phrase: "Kaip manai, ar verta?", scripted: "Priklauso nuo tikslo — papasakokite, ką norite pasiekti.", mention: "priklauso" },
  { phrase: "Paaiškink, kodėl", scripted: "Paaiškinsiu — duokite šiek tiek konteksto.", mention: "konteksto" },
  { phrase: "O kas jeigu pakeisiu nuomonę?", scripted: "Nieko baisaus — sprendimus galima keisti iki paskelbimo.", mention: "keisti" },
  { phrase: "Noriu ką nors parduoti, bet dar nežinau ką", scripted: "Padėsiu apsispręsti — kokios srities daiktas?", mention: "apsispręsti" },
  { phrase: "Ką siūlytum šeimai?", scripted: "Šeimai galiu pasiūlyti patikimų variantų — koks biudžetas?", mention: "biudžetas" },
  { phrase: "Kaip parduoti greičiau?", scripted: "Greitesniam pardavimui svarbu gera kaina, nuotraukos ir aprašymas.", mention: "nuotraukos" },
];

function openDomainScenario(c: OpenDomainCase): GoldenScenario {
  return {
    id: "OPEN",
    group: "open-domain",
    title: c.phrase,
    turns: [
      {
        userText: c.phrase,
        model: [round(text(c.scripted))],
        expect: {
          forbiddenTools: ["searchListings"],
          forbiddenEffects: ["listing_published"],
          ...(c.mention ? { replyMustMention: [c.mention] } : {}),
        },
      },
    ],
  };
}

describe("E2.1 — open-domain generalization gate (32 unseen dialog phrases)", () => {
  for (const c of OPEN_DOMAIN) {
    it(`„${c.phrase}“ never becomes a catalog search`, async () => {
      const result = await runGoldenScenario(openDomainScenario(c));
      assert.equal(
        result.endToEndCorrect,
        true,
        `open-domain phrase failed: ${result.failures
          .map((f) => `${f.category}: ${f.message}`)
          .join(" | ")}`
      );
    });
  }
});
