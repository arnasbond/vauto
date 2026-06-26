import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/apie/", label: "Apie VAUTO" },
  { href: "/install/", label: "Įdiegti" },
  { href: "/taisykles/", label: "Taisyklės" },
  { href: "/privatumas/", label: "Privatumas" },
] as const;

export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer
      className={`border-t border-[var(--vauto-border,#e5e7eb)] bg-[var(--vauto-surface,#fff)] px-4 py-6 text-center ${className}`}
    >
      <nav
        className="mb-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-medium text-[var(--vauto-text-muted,#6b7280)]"
        aria-label="Poraštės navigacija"
      >
        {FOOTER_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="transition hover:text-[var(--vauto-teal,#0d9488)]"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <p className="text-[10px] text-[var(--vauto-text-muted,#9ca3af)]">
        © {new Date().getFullYear()} VAUTO · Nacionalinė skelbimų ekosistema Lietuvoje
      </p>
    </footer>
  );
}
