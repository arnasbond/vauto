"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const ANIMATION_MS = 1000;
const SPINTA_TAB_ID = "bottom-nav-mano-skelbimai";

interface PublishCelebrationContextValue {
  spintaPulse: boolean;
  playPublishCelebration: (fromRect: DOMRect) => Promise<void>;
}

const PublishCelebrationContext =
  createContext<PublishCelebrationContextValue | null>(null);

function PaperPlaneIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

export function PublishCelebrationProvider({ children }: { children: ReactNode }) {
  const [spintaPulse, setSpintaPulse] = useState(false);
  const [flight, setFlight] = useState<{
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  } | null>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const resolveRef = useRef<(() => void) | null>(null);

  const playPublishCelebration = useCallback((fromRect: DOMRect) => {
    return new Promise<void>((resolve) => {
      const target = document.getElementById(SPINTA_TAB_ID);
      const targetRect = target?.getBoundingClientRect();
      const toX = targetRect
        ? targetRect.left + targetRect.width / 2
        : window.innerWidth * 0.25;
      const toY = targetRect
        ? targetRect.top + targetRect.height / 2
        : window.innerHeight - 48;

      const fromX = fromRect.left + fromRect.width / 2;
      const fromY = fromRect.top + fromRect.height / 2;

      resolveRef.current = resolve;
      setFlight({ fromX, fromY, toX, toY });
      setSpintaPulse(true);

      window.setTimeout(() => setSpintaPulse(false), 1400);
    });
  }, []);

  const handleAnimationEnd = useCallback(() => {
    setFlight(null);
    resolveRef.current?.();
    resolveRef.current = null;
  }, []);

  useFlightAnimation(planeRef, flight, handleAnimationEnd);

  const value = useMemo(
    () => ({ spintaPulse, playPublishCelebration }),
    [spintaPulse, playPublishCelebration]
  );

  return (
    <PublishCelebrationContext.Provider value={value}>
      {children}
      {typeof document !== "undefined" &&
        flight &&
        createPortal(
          <div
            className="publish-airplane-overlay pointer-events-none fixed inset-0 z-[120]"
            aria-hidden
          >
            <div
              ref={planeRef}
              className="publish-airplane absolute will-change-transform"
              style={{
                left: flight.fromX,
                top: flight.fromY,
                marginLeft: -14,
                marginTop: -14,
              }}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--vauto-primary)] text-white shadow-lg shadow-[var(--vauto-primary)]/40">
                <PaperPlaneIcon className="h-4 w-4 -rotate-12" />
              </span>
            </div>
          </div>,
          document.body
        )}
    </PublishCelebrationContext.Provider>
  );
}

function useFlightAnimation(
  planeRef: React.RefObject<HTMLDivElement | null>,
  flight: { fromX: number; fromY: number; toX: number; toY: number } | null,
  onDone: () => void
) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!flight || !planeRef.current) return;

    const el = planeRef.current;
    const dx = flight.toX - flight.fromX;
    const dy = flight.toY - flight.fromY;
    const midX = dx * 0.45;
    const midY = dy * 0.45 - Math.min(120, window.innerHeight * 0.18);

    const anim = el.animate(
      [
        {
          transform: "translate3d(0, 0, 0) rotate(-38deg) scale(0.55)",
          opacity: 0,
        },
        {
          transform: `translate3d(${midX * 0.35}px, ${midY * 0.35}px, 0) rotate(-22deg) scale(0.85)`,
          opacity: 1,
          offset: 0.18,
        },
        {
          transform: `translate3d(${dx}px, ${dy}px, 0) rotate(14deg) scale(0.3)`,
          opacity: 0,
        },
      ],
      {
        duration: ANIMATION_MS,
        easing: "cubic-bezier(0.33, 0.86, 0.45, 1)",
        fill: "forwards",
      }
    );

    anim.onfinish = () => onDoneRef.current();
    anim.oncancel = () => onDoneRef.current();

    return () => anim.cancel();
  }, [flight, planeRef]);
}

export function usePublishCelebration(): PublishCelebrationContextValue {
  const ctx = useContext(PublishCelebrationContext);
  if (!ctx) {
    throw new Error(
      "usePublishCelebration must be used within PublishCelebrationProvider"
    );
  }
  return ctx;
}

export function usePublishCelebrationOptional(): PublishCelebrationContextValue | null {
  return useContext(PublishCelebrationContext);
}

export { SPINTA_TAB_ID };
