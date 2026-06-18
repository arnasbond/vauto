import type { ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";

interface AppShellProps {
  children: ReactNode;
  hideNav?: boolean;
  /** Light inner pages (chats, profile) vs home split layout */
  variant?: "home" | "plain";
}

export function AppShell({
  children,
  hideNav = false,
  variant = "home",
}: AppShellProps) {
  if (variant === "plain") {
    return (
      <div className="flex min-h-dvh flex-col bg-white">
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pt-4 pb-28">
          {children}
        </div>
        {!hideNav && <BottomNav />}
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col pb-24">
        {children}
      </div>
      {!hideNav && <BottomNav />}
    </div>
  );
}
