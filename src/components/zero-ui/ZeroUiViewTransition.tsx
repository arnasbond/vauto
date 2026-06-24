"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { ZeroUiScreen } from "@/lib/zero-ui-screens";

const TRANSITION_MS = 350;

type PanelPhase = "enter" | "exit" | "idle";

interface ViewPanel {
  id: number;
  view: ZeroUiScreen;
  phase: PanelPhase;
}

interface ZeroUiViewTransitionProps {
  view: ZeroUiScreen;
  renderView: (view: ZeroUiScreen) => ReactNode;
}

export function ZeroUiViewTransition({
  view,
  renderView,
}: ZeroUiViewTransitionProps) {
  const idRef = useRef(1);
  const renderRef = useRef(renderView);
  renderRef.current = renderView;

  const [panels, setPanels] = useState<ViewPanel[]>([
    { id: 0, view, phase: "idle" },
  ]);

  const activeViewRef = useRef(view);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (activeViewRef.current === view) return;

    const nextId = ++idRef.current;
    activeViewRef.current = view;

    setPanels((prev) => {
      const exiting = prev.map((p) =>
        p.phase === "exit" ? p : { ...p, phase: "exit" as const }
      );
      return [...exiting, { id: nextId, view, phase: "enter" as const }];
    });

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      setPanels([{ id: nextId, view, phase: "idle" }]);
      timeoutRef.current = null;
    }, TRANSITION_MS);

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [view]);

  return (
    <div
      className="zero-ui-screen-stage"
      aria-live="polite"
      aria-atomic="true"
    >
      {panels.map((panel) => (
        <div
          key={panel.id}
          className={cn(
            "zero-ui-screen-panel",
            panel.phase === "enter" && "zero-ui-screen-enter",
            panel.phase === "exit" && "zero-ui-screen-exit",
            panel.phase === "idle" && "zero-ui-screen-idle"
          )}
          data-zero-ui-view={panel.view}
        >
          {renderRef.current(panel.view)}
        </div>
      ))}
    </div>
  );
}
