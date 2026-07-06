"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { performDeepWebRefresh } from "@/lib/deep-web-refresh";
import { cn } from "@/lib/cn";

const PULL_THRESHOLD_PX = 72;
const MAX_PULL_PX = 112;

export function PullToRefreshHost({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const pullPxRef = useRef(0);
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const isNative = Capacitor.isNativePlatform();

  const setPull = useCallback((value: number) => {
    pullPxRef.current = value;
    setPullPx(value);
  }, []);

  const resetPull = useCallback(() => {
    pullingRef.current = false;
    setPull(0);
  }, [setPull]);

  const triggerRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setPull(PULL_THRESHOLD_PX);
    try {
      await performDeepWebRefresh();
    } catch {
      setRefreshing(false);
      resetPull();
    }
  }, [refreshing, resetPull, setPull]);

  useEffect(() => {
    if (!isNative) return;
    const root = rootRef.current;
    if (!root) return;

    const onTouchStart = (event: TouchEvent) => {
      if (refreshing) return;
      if (window.scrollY > 4) return;
      startYRef.current = event.touches[0]?.clientY ?? 0;
      pullingRef.current = true;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!pullingRef.current || refreshing) return;
      if (window.scrollY > 4) {
        resetPull();
        return;
      }

      const currentY = event.touches[0]?.clientY ?? 0;
      const delta = currentY - startYRef.current;
      if (delta <= 0) {
        setPull(0);
        return;
      }

      setPull(Math.min(MAX_PULL_PX, delta * 0.55));
      if (delta > 8) event.preventDefault();
    };

    const onTouchEnd = () => {
      if (!pullingRef.current || refreshing) return;
      pullingRef.current = false;
      if (pullPxRef.current >= PULL_THRESHOLD_PX) {
        void triggerRefresh();
      } else {
        resetPull();
      }
    };

    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("touchend", onTouchEnd, { passive: true });
    root.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [isNative, refreshing, resetPull, setPull, triggerRefresh]);

  if (!isNative) {
    return <>{children}</>;
  }

  const progress = Math.min(1, pullPx / PULL_THRESHOLD_PX);
  const showIndicator = pullPx > 6 || refreshing;

  return (
    <div ref={rootRef} className="relative min-h-dvh w-full">
      <div
        aria-hidden={!showIndicator}
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-[99990] flex justify-center",
          "pt-[max(env(safe-area-inset-top),8px)] transition-opacity duration-150",
          showIndicator ? "opacity-100" : "opacity-0"
        )}
        style={{ height: Math.max(pullPx, refreshing ? PULL_THRESHOLD_PX : 0) }}
      >
        <div className="mt-2 flex flex-col items-center gap-1">
          <Loader2
            className={cn(
              "h-5 w-5 text-[var(--vauto-neon,var(--flux-cyan))]",
              refreshing ? "animate-spin" : ""
            )}
            style={{
              transform: refreshing ? undefined : `rotate(${progress * 360}deg)`,
            }}
          />
          <span className="text-[10px] font-semibold text-slate-400">
            {refreshing ? "Atnaujinama…" : progress >= 1 ? "Paleiskite" : "Patraukite žemyn"}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}
