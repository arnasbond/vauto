/** anonser.lt portal integration — logo, back links, B2B nav. */

const DEFAULT_ANONSER_URL = "https://anonser.lt";
const DEFAULT_VAUTO_URL = "https://www.vauto.lt";

export function getAnonserPortalUrl(): string {
  return (
    process.env.NEXT_PUBLIC_ANONSER_URL?.replace(/\/$/, "") ||
    DEFAULT_ANONSER_URL
  );
}

export function getVautoPortalUrl(): string {
  return (
    process.env.NEXT_PUBLIC_VAUTO_URL?.replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : DEFAULT_VAUTO_URL)
  );
}

export interface AnonserNavLink {
  label: string;
  href: string;
  external?: boolean;
}

/** Primary links — VAUTO first; only DELIBERATE partner integration links
 *  (B2B portal + partner contacts). No generic/unverifiable URLs. */
export function getAnonserNavLinks(): AnonserNavLink[] {
  const base = getAnonserPortalUrl();
  const vauto = getVautoPortalUrl();
  return [
    { label: "VAUTO", href: vauto, external: false },
    { label: "Verslui", href: `${base}/verslui`, external: true },
    { label: "Kontaktai", href: `${base}/kontaktai`, external: true },
  ];
}

export function getAnonserLogoSrc(): string | null {
  const custom = process.env.NEXT_PUBLIC_ANONSER_LOGO_URL?.trim();
  return custom || null;
}
