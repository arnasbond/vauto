/**
 * Structured input pipeline — maps user raw input (text, voice, image)
 * into structured listing fields with mandatory disambiguation and confirmation loops.
 */

import { buildListingDraftUpdateReply } from "./listing-draft-preview.js";
import {
  applyParsedContactsToListingDraft,
  buildListingContactUpdateReply,
  parseListingContactFromText,
  textContainsListingContactSignals,
} from "./listing-contact-parse.js";
import { isListingWorkflowCommand, isPublishWorkflowCommand } from "./listing-workflow-intent.js";
import {
  buildConversationalMissingPrompt,
  PRE_PUBLISH_CARD_INTRO,
} from "./listing-conversational-flow.js";
import {
  buildServerPrePublishCardPayload,
  evaluateServerPrePublishReadiness,
  type ServerPrePublishCardPayload,
} from "./pre-publish-validation.js";
import { buildVehicleSpecReportMarkdown } from "../shared/listing-organism.js";

export const TEXT_AND_VISION_INPUT_ONLY = `ĮVESTIES KANALAI (PRIVALOMA):
- Vartotojo įvestis gaunama TIK TEKSTU (paieškos laukas, pokalbio žinutės) arba per VAIZDO ANALIZĘ (nuotraukos įkėlimas).
- NĖRA balso įvesties (STT), mikrofono ar garso įrašų — NIEKADA nesiūlyk „pasakyti balsu“, „įrašyti balsu“ ar prašyti mikrofono leidimo.
- Jei vartotojas mini balsą — mandagiai nukreipk į tekstinę įvestį arba nuotraukos įkėlimą.`;

export const STRUCTURED_INPUT_PIPELINE_RULES = `STRUKTŪRIZUOTOS ĮVESTIES SRAUTAS (PRIVALOMA — tekstas ir vaizdo analizė):

1) ĮVESTIES APdorojimas (User Raw Input → Structured Listing Fields):
- Bet kokia vartotojo įvestis — tekstas ar nuotraukos kontekstas — yra neapdorota žaliava.
- Tavo paskirtis: ištraukti objektus ir faktus iš įvesties ir juos tvarkingai priskirti struktūrizuotiems skelbimo laukams:
  category, title, description, price, location (+ kategorijai būdingi attributes).
- NIEKADA nepalik laukų „atspėtų“ be pakankamo pagrindo iš įvesties. Jei duomenų trūksta — confidence mažink ir užduok klausimą.

2) Išankstinis patikslinimas (Disambiguation Loop — PRIVALOMA sustoti):
- Jei įvestyje keli objektai, prieštaringa informacija, neaiški kategorija ar trūksta esminių duomenų — SUSTOK.
- NEPRISKIR kategorijos, skelbimo tipo ar kainos vienašališkai be vartotojo patvirtinimo.
- Užduok vieną aiškų klausimą su 2–4 pasirinkimais (choiceChips / followUpQuestion).
- Pavyzdys: „Nuotraukoje matau kambarį ir televizorių — ar teisingai suprantu, kad šį skelbimą ruošiame televizoriui?“ arba „Kurį objektą norite parduoti: televizorių ar stalą?“
- create_listing_draft / updateListingDraft / postNewListing — TIK po patvirtinimo arba aiškaus vieno objekto atpažinimo (confidence ≥ 0.55).
- DRAUDŽIAMA: automatiškai priskirti PASLAUGOS kategoriją kambario vaizdui; fiksuoti kainą be įvesties; užpildyti formą išgalvotais duomenimis.

3) Patvirtinimo ataskaita (Confirmation Flow — po sėkmingo laukų užpildymo):
- Kai laukai užpildyti iš įvesties — pokalbyje PRIVALOMA pateikti vizualų juodraščio peržiūrą, spragų analizę ir pardavimo patarimą (žr. JUODRAŠČIO PERŽIŪRA).
- DRAUDŽIAMA atsakyti vienu sakiniu be peržiūros: „Supratau — atnaujinau“, „Juodraštis atnaujintas“, „Gerai“.
- Siūlyk konkrečius taisymo kelius: kategoriją, pavadinimą, kainą, aprašymą, miestą.
- Jei vartotojas prašo pataisyti — updateListingDraft, ne naujas juodraštis iš nieko.`;

export const STRUCTURED_INPUT_VISION_RULES = `VAIZDO ĮVESTIS (nuotrauka — ta pati pipeline logika):
- Identifikuok parduodamus objektus (detectedObjects). DRAUDŽIAMA poetizuoti foną (trinkelės, namas, medžiai, dangus) vietoj prekės.
- DRAUDŽIAMA į detectedObjects dėti tech passport / registracijos liudijimą / kvitą — jie tik OCR dokumentai.
- Keli parduodami objektai → trumpi choiceChips „Parduoti {objektas}“; confidence < 0.55 → disambiguation.
- Vienas aiškus objektas → užpildyk juodraščio JSON su MASTER SALES COPYWRITER title+description (hook + bullet ypatybės + CTA).
- Automobiliai + techninis pasas: OCR faktai → technicalFields; pokalbyje gali parodyti Markdown specifikacijų santrauką, BET description laukas VISADA turi būti turtingas marketplace sales copy (ne sausas caption).
- DRAUDŽIAMA klausti kainos jei vartotojas jos nenurodė; DRAUDŽIAMA išgalvoti kainą / ridą / TA.
- Jei objektas neaiškus — nekurk pilno skelbimo; užduok patikslinimo klausimą be fono aprašymų.`;

export const LISTING_WORKFLOW_COMMAND_RULES = `SISTEMINIAI DARBO EIGOS ĮSAKYMAI (PRIVALOMA — ne skelbimo laukai):
- Frazės, atitinkančios patvirtinimo ar publikavimo komandas, yra SISTEMINIAI ĮSAKYMAI, ne skelbimo atributai.
- Pavyzdžiai: „viskas tinka“, „gerai“, „taip“, „publikuok“, „publikuoti“, „taip, publikuoti“, „publikuojam“, „viskas gerai“, „viskas tikslu“.
- DRAUDŽIAMA: įrašyti šias frazes į title, description, attributes ar bet kurį Prisma/DB lauką.
- DRAUDŽIAMA: append'inti jas prie aprašymo ar pavadinimo per updateListingDraft.
- Kai vartotojas rašo tokias frazes — SUSTOK tekstinio laukų atnaujinimo pipeline ir perjunk į pre-publish validacijos vartus (evaluatePrePublishReadiness).
- Jei validacija praeina — parodyk PrePublishListingCard peržiūrą; jei ne — konversacinį klausimą apie trūkstamus duomenis (ne ⚠️ bloką).`;

export const LISTING_CONTACT_CAPTURE_RULES = `KONTAKTŲ LAUKŲ GAVIMAS (blokavimo / patvirtinimo fazė — PRIVALOMA):
- Jei userContext jau turi sellerPhone / sellerCity / sellerName — NIEKADA neklausti iš naujo; naudok sesijos reikšmes.
- Kai TRŪKSTA telefono ar miesto, vartotojo laisvas tekstas gali turėti kontaktus (pvz. „068876808 Kaišiadorys“).
- Iš teksto PRIVALOMA ištraukti:
  • LT telefoną (06..., +370..., 86...) → attributes.phone (NE description, NE title)
  • LT miestą (Kaišiadorys, Vilnius, Kaunas…) → location / attributes.location
- DRAUDŽIAMA laikyti valiutą / kainą vardu (eur, euru, euro, 2250 eur → NIEKADA contactName „Euru“).
- Vardą keisti TIK pagal aiškią komandą („pakeisk vardą į …“). Kitaip contactName lieka iš userContext.
- DRAUDŽIAMA append'inti telefono numerius, miestus ar vardus prie description ar title.
- Po sėkmingo ištraukimo atsakyk trumpai su atnaujintais laukais.
- Jei vartotojas paspaudė „Telefono numeris“ arba „Miestas“ — prašyk tik to lauko (izoliuota įvestis).`;

export const STRUCTURED_INPUT_AGENT_TOOL_RULES = `FUNKCIJŲ KVIEČIMAS (sąsaja su pipeline):
- scanListingPhotos → jei multi-object ar žema confidence: reply + followUpQuestion + choiceChips, NE updateListingDraft.
- updateListingDraft / postNewListing → tik po disambiguation loop arba aiškaus vieno objekto.
- Po sėkmingo updateListingDraft → natūrali juodraščio santrauka (Kelrodės tonas) + showZeroUiScreen(listing_preview).`;

/** Greiti atsakymai po sėkmingo laukų užpildymo — disabled (PrePublish card owns CTA). */
export const POST_VALIDATION_QUICK_REPLIES = [] as const;

/** Greiti atsakymai kai paieška grąžina 0 rezultatų. */
export const EMPTY_SEARCH_QUICK_REPLIES = [
  "Užfiksuoti norą",
  "Platesnė paieška",
  "Kita kategorija",
  "Parodyti populiariausius",
] as const;

/** Confirmation flow message after structured fields are populated. */
export function buildPostValidationReportMessage(fields: {
  category: string;
  title: string;
  description?: string;
  price?: number;
  location?: string;
  attributes?: Record<string, string | undefined>;
}): string {
  const cat = String(fields.category ?? "").toLowerCase();
  if (
    cat === "vehicles" ||
    cat === "automobiliai" ||
    Boolean(
      fields.attributes?.make ||
        fields.attributes?.vin ||
        fields.attributes?.plate ||
        fields.attributes?.licensePlate ||
        fields.attributes?.powerKw
    )
  ) {
    return buildVehicleSpecReportMarkdown({
      title: fields.title,
      description: fields.description,
      category: fields.category,
      attributes: fields.attributes,
    });
  }
  return buildListingDraftUpdateReply({
    category: fields.category,
    title: fields.title,
    description: fields.description,
    price: fields.price,
    location: fields.location,
    attributes: fields.attributes,
  });
}

export type StructuredInputRoute =
  | { kind: "listing_field_update"; text: string }
  | { kind: "workflow_command"; text: string }
  | { kind: "publish_gateway"; text: string }
  | { kind: "contact_capture"; text: string };

/** Strict intent router — separates listing field updates from workflow/system commands. */
export function resolveStructuredListingInputRoute(
  text: string,
  opts?: { hasListingDraft?: boolean; prePublishBlocked?: boolean }
): StructuredInputRoute {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "listing_field_update", text: trimmed };

  if (
    opts?.hasListingDraft &&
    (opts.prePublishBlocked || textContainsListingContactSignals(trimmed))
  ) {
    const parsed = parseListingContactFromText(trimmed);
    if (parsed.hasAny) return { kind: "contact_capture", text: trimmed };
  }

  if (opts?.hasListingDraft && isPublishWorkflowCommand(trimmed)) {
    return { kind: "publish_gateway", text: trimmed };
  }
  if (opts?.hasListingDraft && isListingWorkflowCommand(trimmed)) {
    return { kind: "workflow_command", text: trimmed };
  }
  return { kind: "listing_field_update", text: trimmed };
}

export interface ContactCaptureGatewayResponse {
  reply: string;
  quickReplies?: string[];
  listingDraft: {
    title?: string;
    description?: string;
    price?: number;
    location?: string;
    category?: string;
    attributes?: Record<string, string>;
  };
}

/** Parse contact details from chat and map to structured draft fields — never description. */
export function resolveContactCaptureResponse(input: {
  text: string;
  listingDraft: {
    title?: string;
    description?: string;
    price?: number;
    location?: string;
    category?: string;
    attributes?: Record<string, string>;
  };
}): ContactCaptureGatewayResponse | null {
  const parsed = parseListingContactFromText(input.text.trim());
  if (!parsed.hasAny) return null;

  const listingDraft = applyParsedContactsToListingDraft(
    input.listingDraft,
    parsed
  );

  return {
    reply: buildListingContactUpdateReply(parsed),
    quickReplies: ["Viskas tinka", "Suvesti trūkstamus duomenis"],
    listingDraft,
  };
}

export interface PrePublishGatewayResponse {
  reply: string;
  quickReplies?: string[];
  prePublishCard?: ServerPrePublishCardPayload;
}

/** Pre-publish gateway — conversational prompts only; card after confirmation. */
export function resolvePrePublishGatewayResponse(input: {
  isAuthenticated?: boolean;
  profilePhone?: string;
  profileEmail?: string;
  userCity?: string;
  contact?: string;
  listingDraft?: {
    title?: string;
    description?: string;
    price?: number;
    location?: string;
    category?: string;
    attributes?: Record<string, string>;
    orderedImageUrls?: string[];
  };
  pendingImageUrls?: string[];
  imageUrl?: string;
  geoCityHint?: string;
}): PrePublishGatewayResponse {
  const readiness = evaluateServerPrePublishReadiness(input);
  if (!readiness.ok) {
    return {
      reply: buildConversationalMissingPrompt({
        missingAuth: readiness.missingAuth,
        missingPhoto: readiness.missingPhoto,
        missingCity: readiness.missingCity,
        missingPrice: readiness.missingPrice,
        missingPhone: readiness.missingPhone,
      }),
    };
  }

  const draft = input.listingDraft;
  const resolvedCity =
    draft?.location?.trim() || input.userCity?.trim() || readiness.resolvedCity;

  const card = buildServerPrePublishCardPayload({
    listingDraft: input.listingDraft,
    resolvedCity,
    resolvedPhone: readiness.resolvedPhone,
    pendingImageUrls: input.pendingImageUrls,
    imageUrl: input.imageUrl,
  });

  if (card && (draft?.price ?? 0) > 0) {
    return {
      reply: PRE_PUBLISH_CARD_INTRO,
      prePublishCard: card,
    };
  }

  // Confirmation stage: never fall back to editable draft bubble chips.
  return {
    reply: PRE_PUBLISH_CARD_INTRO,
    ...(card ? { prePublishCard: card } : {}),
  };
}

function foldWorkflowText(raw: string): string {
  return raw
    .normalize("NFC")
    .toLowerCase()
    .replace(/[.!?,…]+$/g, "")
    .trim();
}

/** Handle edit/confirmation workflow chips without mutating listing fields. */
export function resolveWorkflowCommandResponse(text: string): {
  reply: string;
  quickReplies?: string[];
} {
  const folded = foldWorkflowText(text);

  if (/pataisyti\s+kain/.test(folded)) {
    return {
      reply: "Kokia turėtų būti kaina? Parašykite sumą eurais, pvz. 1200 €.",
      quickReplies: ["Viskas tinka", "Pataisyti aprašymą"],
    };
  }
  if (/pataisyti\s+kategorij/.test(folded)) {
    return {
      reply: "Kokia kategorija? Parašykite, pvz. Automobiliai, Būstas, Drabužiai.",
      quickReplies: ["Viskas tinka", "Pataisyti kainą"],
    };
  }
  if (/pataisyti\s+aprašym/.test(folded) || /pataisyti\s+aprasym/.test(folded)) {
    return {
      reply: "Parašykite naują aprašymą — pakeisiu esamą tekstą.",
      quickReplies: ["Viskas tinka", "Pataisyti kainą"],
    };
  }
  if (/reikia\s+pataisyti/.test(folded) || /redaguoti\s+duomenis/.test(folded)) {
    return {
      reply: "Ką norite pataisyti? Pasirinkite arba parašykite pokalbyje.",
      quickReplies: [...POST_VALIDATION_QUICK_REPLIES],
    };
  }
  if (/suvesti\s+tr[uū]kstamus/.test(folded)) {
    return {
      reply:
        "Padėsiu užbaigti — parašykite trūkstamą informaciją pokalbyje (nuotrauka, kaina, miestas ar telefonas).",
      quickReplies: ["✅ Viskas tinka"],
    };
  }

  return {
    reply: "Supratau — tęskime skelbimo ruošimą.",
    quickReplies: [...POST_VALIDATION_QUICK_REPLIES],
  };
}
