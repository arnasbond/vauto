/** anonser.lt portal integration — logo, back links, B2B nav. */

const DEFAULT_ANONSER_URL = "https://anonser.lt";
const DEFAULT_VAUTO_SUBDOMAIN_URL = "https://vauto.anonser.lt";

export function getAnonserPortalUrl(): string {
  return (
    process.env.NEXT_PUBLIC_ANONSER_URL?.replace(/\/$/, "") ||
    DEFAULT_ANONSER_URL
  );
}

export function getVautoPortalUrl(): string {
  return (
    process.env.NEXT_PUBLIC_VAUTO_URL?.replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : DEFAULT_VAUTO_SUBDOMAIN_URL)
  );
}

export interface AnonserNavLink {
  label: string;
  href: string;
  external?: boolean;
}

/** Primary links back to the WordPress portal and B2B sections. */
export function getAnonserNavLinks(): AnonserNavLink[] {
  const base = getAnonserPortalUrl();
  return [
    { label: "anonser.lt", href: base, external: true },
    { label: "Naujienos", href: `${base}/naujienos`, external: true },
    { label: "Verslui", href: `${base}/verslui`, external: true },
    { label: "Kontaktai", href: `${base}/kontaktai`, external: true },
  ];
}

export function getAnonserLogoSrc(): string | null {
  const custom = process.env.NEXT_PUBLIC_ANONSER_LOGO_URL?.trim();
  return custom || null;
}
