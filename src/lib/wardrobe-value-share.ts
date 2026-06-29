import { SITE_URL } from "@/lib/social-share";

export interface WardrobeValueShareCopy {
  facebook: string;
  instagram: string;
  url: string;
}

export function buildWardrobeValueShareCopy(params: {
  wardrobeValueTotal: number;
  itemCount: number;
  userName?: string;
}): WardrobeValueShareCopy {
  const total = Math.round(params.wardrobeValueTotal);
  const count = params.itemCount;
  const first = params.userName?.trim().split(/\s+/)[0] || "Aš";
  const url = `${SITE_URL.replace(/\/$/, "")}/fashion/mine/`;

  return {
    url,
    facebook: `✨ ${first} atskleidė savo VAUTO Spintą — ${count} prekės, bendra vertė ${total} €! AI dvynys jau derasi ir padeda parduoti. Peržiūrėk: ${url}`,
    instagram: `👗 Mano spintos vertė: ${total} €\n✨ ${count} prekės jau VAUTO ekosistemoje\n🤖 AI dvynys derasi už mane\n👉 ${url}\n#vauto #spinta #secondhand #mada`,
  };
}
