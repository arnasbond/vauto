import type { ReactNode } from "react";

/** Gradient hero block — top section matching mockup */
export function HeroSection({ children }: { children: ReactNode }) {
  return (
    <section className="vauto-hero safe-top rounded-b-[2rem] px-4 pb-20 pt-2">
      {children}
    </section>
  );
}

/** Content area below hero — dark glass surface */
export function ContentSection({ children }: { children: ReactNode }) {
  return (
    <section className="-mt-12 flex-1 rounded-t-3xl bg-[#0f172a] px-4 pt-6">
      {children}
    </section>
  );
}
