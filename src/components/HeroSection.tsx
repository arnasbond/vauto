import type { ReactNode } from "react";

/** Flux hero — transparent; ambient mesh comes from AppShell */
export function HeroSection({ children }: { children: ReactNode }) {
  return (
    <section className="safe-top px-4 pb-4 pt-0">
      {children}
    </section>
  );
}

/** Content area below hero */
export function ContentSection({ children }: { children: ReactNode }) {
  return (
    <section className="flex-1 px-4 pt-1 pb-6">{children}</section>
  );
}
