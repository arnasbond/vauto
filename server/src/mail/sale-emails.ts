/** Lithuanian post-sale email templates for seller and buyer. */
import { appUrl, formatEur, renderEmailLayout, type EmailRow } from "./mailer.js";

export interface SaleEmailContext {
  listingId?: string;
  listingTitle: string;
  amount: number;
  sellerName?: string;
  buyerName?: string;
  threadId?: string;
  /** Omniva/carrier tracking code once a label exists. */
  trackingCode?: string;
  lockerName?: string;
  carrierLabel?: string;
  labelUrl?: string;
}

function participantRow(label: string, name?: string): EmailRow[] {
  return name?.trim() ? [{ label, value: name.trim() }] : [];
}

function shippingRows(ctx: SaleEmailContext): EmailRow[] {
  const rows: EmailRow[] = [];
  if (ctx.carrierLabel) rows.push({ label: "Vežėjas", value: ctx.carrierLabel });
  if (ctx.lockerName) rows.push({ label: "Paštomatas", value: ctx.lockerName });
  if (ctx.trackingCode) rows.push({ label: "Siuntos numeris", value: ctx.trackingCode });
  return rows;
}

function threadUrl(ctx: SaleEmailContext): string {
  return ctx.threadId
    ? appUrl(`/messages/?thread=${encodeURIComponent(ctx.threadId)}`)
    : appUrl("/messages/");
}

export function renderSellerSaleEmail(ctx: SaleEmailContext): {
  subject: string;
  html: string;
} {
  const hasLabel = Boolean(ctx.trackingCode);

  return {
    subject: `[VAUTO] Prekė parduota — ${ctx.listingTitle}`,
    html: renderEmailLayout({
      heading: "Sveikiname, prekė parduota!",
      intro:
        "Pirkėjas apmokėjo užsakymą, o pinigai saugiai laikomi VAUTO apsaugotoje sąskaitoje, kol pirkėjas patvirtins gavimą.",
      rows: [
        { label: "Prekė", value: ctx.listingTitle },
        { label: "Suma", value: formatEur(ctx.amount) },
        ...participantRow("Pirkėjas", ctx.buyerName),
        ...shippingRows(ctx),
      ],
      highlight: hasLabel
        ? {
            title: "Ką daryti toliau",
            body: `Atsispausdinkite siuntos lipduką, priklijuokite jį ant pakuotės ir per 2 darbo dienas įnešk siuntą į paštomatą. Siuntos numeris: ${ctx.trackingCode}.`,
          }
        : {
            title: "Ką daryti toliau",
            body: "Sugeneruokite siuntos lipduką savo kabinete, supakuokite prekę ir įneškite ją į paštomatą per 2 darbo dienas.",
          },
      cta: ctx.labelUrl
        ? { label: "Atsisiųsti siuntos lipduką", url: ctx.labelUrl }
        : { label: "Atidaryti pardavimą", url: threadUrl(ctx) },
      footnote:
        "Išmoka pervedama į jūsų Stripe išmokėjimo sąskaitą iškart po to, kai pirkėjas patvirtina prekės gavimą.",
    }),
  };
}

export function renderBuyerSaleEmail(ctx: SaleEmailContext): {
  subject: string;
  html: string;
} {
  return {
    subject: `[VAUTO] Apmokėjimas gautas — ${ctx.listingTitle}`,
    html: renderEmailLayout({
      heading: "Jūsų pirkimas patvirtintas",
      intro:
        "Gavome jūsų apmokėjimą. Suma laikoma saugioje VAUTO sąskaitoje ir pardavėjui pervedama tik tada, kai patvirtinsite, jog prekę gavote.",
      rows: [
        { label: "Prekė", value: ctx.listingTitle },
        { label: "Sumokėta", value: formatEur(ctx.amount) },
        ...participantRow("Pardavėjas", ctx.sellerName),
        ...shippingRows(ctx),
      ],
      highlight: ctx.trackingCode
        ? {
            title: "Siuntos sekimas",
            body: `Pardavėjas jau turi siuntos lipduką. Siuntą galite sekti pagal numerį ${ctx.trackingCode}${
              ctx.lockerName ? `, atsiėmimo vieta — ${ctx.lockerName}` : ""
            }.`,
          }
        : {
            title: "Kas toliau",
            body: "Pardavėjas per 2 darbo dienas turi išsiųsti prekę. Kai siunta bus užregistruota, atsiųsime sekimo numerį.",
          },
      cta: { label: "Peržiūrėti pirkimą", url: threadUrl(ctx) },
      footnote:
        "Jei prekė neatitiks aprašymo arba nebus išsiųsta, pinigai bus grąžinti — pirkėjo apsauga veikia automatiškai.",
    }),
  };
}
