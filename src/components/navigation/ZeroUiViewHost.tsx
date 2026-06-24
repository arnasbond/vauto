"use client";

import { useNavigation } from "@/context/NavigationContext";
import { ZeroUiViewContent } from "@/components/navigation/ZeroUiViews";

/**
 * Full-screen Zero-UI layer driven by Gemini navigate_view.
 * Renders above the static route without a full page reload.
 */
export function ZeroUiViewHost() {
  const { zeroUiActive, currentView } = useNavigation();

  if (!zeroUiActive) return null;

  return (
    <div
      id="zero-ui-view-host"
      className="fixed inset-0 z-[60] flex flex-col bg-[var(--portal-bg,#f3f5f8)] text-[var(--portal-text,#1f2937)]"
      role="region"
      aria-label="AI valdomas vaizdas"
    >
      <div className="mx-auto flex h-full w-full max-w-lg flex-col px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(5.5rem,env(safe-area-inset-bottom))]">
        <ZeroUiViewContent view={currentView} />
      </div>
    </div>
  );
}
