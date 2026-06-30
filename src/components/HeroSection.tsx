import type { ReactNode } from "react";

/** Flux hero — transparent; ambient mesh comes from AppShell */
export function HeroSection({ children }: { children: ReactNode }) {
  return (
    <section className="safe-top px-4 pb-5 pt-0">
      {children}
    </section>
  );
}

/** Content area below hero — shell chrome handles bottom safe area */
export function ContentSection({ children }: { children: ReactNode }) {
  return (
    <section className="marketplace-content flex-1 px-4 pt-2">{children}</section>
  );
}
