import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Design Kit — VAUTO UI reference",
  description:
    "Izoliuota dizaino kit peržiūra (Phase 0–1 reference). Mock duomenys; gamybiniai maršrutai naudoja tuos pačius UI komponentus.",
  robots: { index: false, follow: false },
};

export default function PreviewDesignLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
