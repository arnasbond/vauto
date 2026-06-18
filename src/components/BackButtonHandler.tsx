"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { usePathname, useRouter } from "next/navigation";
import { useVauto } from "@/context/VautoContext";

/** Android hardware back: close overlays → navigate back → exit app */
export function BackButtonHandler() {
  const router = useRouter();
  const pathname = usePathname();
  const { sellerStep, cancelSellerFlow } = useVauto();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let remove: (() => void) | undefined;

    async function setup() {
      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("backButton", () => {
        if (sellerStep !== "idle") {
          cancelSellerFlow();
          return;
        }

        const rootPaths = ["/", "/profile/", "/chats/", "/add/"];
        if (!rootPaths.includes(pathname)) {
          router.back();
          return;
        }

        App.exitApp();
      });
      remove = () => handle.remove();
    }

    setup();
    return () => remove?.();
  }, [sellerStep, pathname, cancelSellerFlow, router]);

  return null;
}
