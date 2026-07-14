/**
 * Structured input pipeline — maps user raw input (text, voice, image)
 * into structured listing fields with mandatory disambiguation and confirmation loops.
 */

import { buildListingDraftUpdateReply } from "./listing-draft-preview.js";
import { isListingWorkflowCommand, isPublishWorkflowCommand } from "./listing-workflow-intent.js";
import {
  buildServerPrePublishCardPayload,
  evaluateServerPrePublishReadiness,
  PRE_PUBLISH_BLOCKED_QUICK_REPLIES,
  type ServerPrePublishCardPayload,
} from "./pre-publish-validation.js";

export const PRE_PUBLISH_READY_INTRO =
  "✨ Skelbimas paruoštas publikuoti! Peržiūrėkite, kaip jis atrodys turguje:";

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
- Iš nuotraukos identifikuok visus matomus objektus (detectedObjects) ir aplinkos kontekstą (sceneContext).
- Keli objektai → choiceChips + clarificationPrompt; confidence < 0.55 → privalomas disambiguation loop.
- Vienas aiškus objektas → užpildyk laukus, tada confirmation flow ataskaita.
- Jei objektas neaiškus — nekurk pilno skelbimo; užduok patikslinimo klausimą.`;

export const LISTING_WORKFLOW_COMMAND_RULES = `SISTEMINIAI DARBO EIGOS ĮSAKYMAI (PRIVALOMA — ne skelbimo laukai):
- Frazės, atitinkančios patvirtinimo ar publikavimo komandas, yra SISTEMINIAI ĮSAKYMAI, ne skelbimo atributai.
- Pavyzdžiai: „viskas tinka“, „gerai“, „taip“, „publikuok“, „publikuoti“, „taip, publikuoti“, „publikuojam“, „viskas gerai“, „viskas tikslu“.
- DRAUDŽIAMA: įrašyti šias frazes į title, description, attributes ar bet kurį Prisma/DB lauką.
- DRAUDŽIAMA: append'inti jas prie aprašymo ar pavadinimo per updateListingDraft.
- Kai vartotojas rašo tokias frazes — SUSTOK tekstinio laukų atnaujinimo pipeline ir perjunk į pre-publish validacijos vartus (evaluatePrePublishReadiness).
- Jei validacija praeina — parodyk PrePublishListingCard peržiūrą; jei ne — ⚠️ blokavimo pranešimą su trūkstamais laukais.`;

export const STRUCTURED_INPUT_AGENT_TOOL_RULES = `FUNKCIJŲ KVIEČIMAS (sąsaja su pipeline):
- scanListingPhotos → jei multi-object ar žema confidence: reply + followUpQuestion + choiceChips, NE updateListingDraft.
- updateListingDraft / postNewListing → tik po disambiguation loop arba aiškaus vieno objekto.
- Po sėkmingo updateListingDraft → atsakymas su pilna juodraščio peržiūra (✍️), spragų analize (⚠️), patarimu (💡) + showZeroUiScreen(listing_preview).`;

/** Greiti atsakymai po sėkmingo laukų užpildymo (agentas + klientas). */
export const POST_VALIDATION_QUICK_REPLIES = [
  "Viskas tinka",
  "Pataisyti kainą",
  "Pataisyti kategoriją",
  "Pataisyti aprašymą",
] as const;

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
  | { kind: "publish_gateway"; text: string };

/** Strict intent router — separates listing field updates from workflow/system commands. */
export function resolveStructuredListingInputRoute(
  text: string,
  opts?: { hasListingDraft?: boolean }
): StructuredInputRoute {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "listing_field_update", text: trimmed };
  if (opts?.hasListingDraft && isPublishWorkflowCommand(trimmed)) {
    return { kind: "publish_gateway", text: trimmed };
  }
  if (opts?.hasListingDraft && isListingWorkflowCommand(trimmed)) {
    return { kind: "workflow_command", text: trimmed };
  }
  return { kind: "listing_field_update", text: trimmed };
}

export interface PrePublishGatewayResponse {
  reply: string;
  quickReplies?: string[];
  prePublishCard?: ServerPrePublishCardPayload;
}

/** Pre-publish validation gateway — invoked when publish/confirmation intent is intercepted. */
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
  };
  pendingImageUrls?: string[];
  imageUrl?: string;
}): PrePublishGatewayResponse {
  const readiness = evaluateServerPrePublishReadiness(input);
  if (!readiness.ok) {
    return {
      reply: readiness.blockMessage,
      quickReplies: [...PRE_PUBLISH_BLOCKED_QUICK_REPLIES],
    };
  }

  const card = buildServerPrePublishCardPayload({
    listingDraft: input.listingDraft,
    resolvedCity:
      input.listingDraft?.location?.trim() ||
      input.userCity?.trim() ||
      "",
    pendingImageUrls: input.pendingImageUrls,
    imageUrl: input.imageUrl,
  });

  if (card && (input.listingDraft?.price ?? 0) > 0) {
    return {
      reply: PRE_PUBLISH_READY_INTRO,
      prePublishCard: card,
    };
  }

  return {
    reply:
      "Skelbimo juodraštis paruoštas! Norite, kad jūsų skelbimas parduotų greičiau? Galiu jį iškelti į viršų, paryškinti arba Aktyvuoti jūsų AI Dvynį-Derybininką. Ar pritaikom premium funkciją?",
    quickReplies: [
      "Iškelti į viršų",
      "Paryškinti",
      "Aktyvuoti AI derybininką",
      "Ne, be reklamos",
    ],
  };
}
