import type { Metadata } from "next";
import { UiKitPage } from "@/design-system/UiKitPage";

export const metadata: Metadata = {
  title: "UI Kit — VAUTO Design System 2.0",
  description: "Internal design-system showcase (dev / admin).",
  robots: { index: false, follow: false },
};

export default function UiKitRoutePage() {
  return <UiKitPage />;
}
