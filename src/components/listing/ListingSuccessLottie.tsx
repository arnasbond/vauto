"use client";

import Lottie, { type LottieRefCurrentProps } from "lottie-react";
import { useEffect, useRef } from "react";
import publishSuccessAnimation from "@/assets/lottie/publish-success.json";
import { cn } from "@/lib/cn";

/** 108 frames @ 60fps ≈ 1.8s — matches celebration navigation delay. */
export const LISTING_SUCCESS_LOTTIE_MS = 1800;

interface ListingSuccessLottieProps {
  className?: string;
  /** Called once when the paper-plane → checkmark animation finishes. */
  onComplete?: () => void;
  /** Accessible label for the success graphic. */
  label?: string;
}

/**
 * One-shot Lottie: paper plane flies in, then resolves into a success checkmark.
 * Plays automatically; does not loop.
 */
export function ListingSuccessLottie({
  className,
  onComplete,
  label = "Skelbimas sėkmingai publikuotas",
}: ListingSuccessLottieProps) {
  const lottieRef = useRef<LottieRefCurrentProps>(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const finish = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current?.();
  };

  useEffect(() => {
    const timer = window.setTimeout(finish, LISTING_SUCCESS_LOTTIE_MS + 250);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      className={cn(
        "listing-success-lottie mx-auto flex h-[min(42vw,168px)] w-[min(42vw,168px)] max-h-[168px] max-w-[168px] items-center justify-center overflow-hidden",
        className
      )}
      role="img"
      aria-label={label}
    >
      <Lottie
        lottieRef={lottieRef}
        animationData={publishSuccessAnimation}
        autoplay
        loop={false}
        onComplete={finish}
        className="h-full w-full"
        style={{ maxWidth: 168, maxHeight: 168 }}
        rendererSettings={{
          preserveAspectRatio: "xMidYMid meet",
          progressiveLoad: true,
        }}
      />
    </div>
  );
}
