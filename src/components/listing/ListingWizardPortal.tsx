"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const PORTAL_SHELL =
  "listing-wizard-overlay fixed inset-0 z-[240] overflow-y-auto overscroll-contain pb-36";

/** Renders listing wizards on document.body to escape parent stacking contexts. */
export function ListingWizardPortal({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!enabled) return null;

  /** S0.9 — never return null on first paint (was causing blank /add fashion screen). */
  if (!mounted) {
    return <div className={PORTAL_SHELL}>{children}</div>;
  }

  return createPortal(<div className={PORTAL_SHELL}>{children}</div>, document.body);
}
