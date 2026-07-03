"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useNotificationBell } from "@/context/NotificationBellContext";
import { useAuth } from "@/context/AuthContext";
import { useActivePortal } from "@/hooks/useActivePortal";

export function NotificationBell() {
  const { isAuthenticated, openAuthModal } = useAuth();
  const { ui } = useActivePortal();
  const {
    notifications,
    totalUnreadCount,
    chatUnreadCount,
    dbUnreadCount,
    pushDenied,
    loading,
    openNotification,
    markAllRead,
    refresh,
  } = useNotificationBell();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const handleToggle = () => {
    if (!isAuthenticated) {
      openAuthModal("/chats/");
      return;
    }
    setOpen((v) => !v);
    if (!open) void refresh();
  };

  const unreadLabel =
    totalUnreadCount > 0
      ? `${totalUnreadCount} neperskaitytų`
      : "Pranešimai";

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="vauto-surface-panel relative flex h-10 w-10 items-center justify-center rounded-[14px] border shadow-sm transition hover:opacity-90"
        style={{ borderColor: ui.border, color: ui.accent }}
        aria-label={unreadLabel}
        aria-expanded={open}
      >
        <Bell className="h-[17px] w-[17px]" strokeWidth={1.75} />
        {isAuthenticated && totalUnreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--vauto-red)] px-1 text-[9px] font-bold text-white">
            {totalUnreadCount > 9 ? "9+" : totalUnreadCount}
          </span>
        )}
      </button>

      {open && isAuthenticated && (
        <div className="absolute right-0 top-12 z-50 w-[min(92vw,22rem)] overflow-hidden rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--vauto-border)] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[var(--vauto-text)]">Pranešimai</p>
              <p className="text-[10px] text-[var(--vauto-text-muted)]">
                {pushDenied
                  ? "Push atmestas — varpelis sinchronizuoja fone"
                  : "Realaus laiko + atsarginis sluoksnis"}
              </p>
            </div>
            {dbUnreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-[10px] font-semibold text-[var(--vauto-teal)]"
              >
                Visi perskaityti
              </button>
            )}
          </div>

          {chatUnreadCount > 0 && (
            <Link
              href="/chats/"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 border-b border-[var(--vauto-border)] px-4 py-3 text-sm hover:bg-[var(--vauto-border)]/20"
            >
              <MessageCircle className="h-4 w-4 text-[var(--vauto-teal)]" />
              <span>
                {chatUnreadCount} neperskaityt{chatUnreadCount === 1 ? "as" : "i"} pokalbi
                {chatUnreadCount === 1 ? "s" : "ai"}
              </span>
            </Link>
          )}

          <div className="max-h-72 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[var(--vauto-text-muted)]">
                Kraunama…
              </p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[var(--vauto-text-muted)]">
                Naujų pranešimų nėra.
              </p>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void openNotification(n);
                  }}
                  className={`w-full border-b border-[var(--vauto-border)]/60 px-4 py-3 text-left transition hover:bg-[var(--vauto-border)]/15 ${
                    !n.readAt ? "bg-[var(--vauto-teal)]/5" : ""
                  }`}
                >
                  <p className="text-xs font-semibold text-[var(--vauto-text)]">{n.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-[var(--vauto-text-muted)]">
                    {n.body}
                  </p>
                  <p className="mt-1 text-[9px] text-[var(--vauto-text-muted)]">
                    {new Date(n.createdAt).toLocaleString("lt-LT", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </button>
              ))
            )}
          </div>

          <div className="border-t border-[var(--vauto-border)] px-4 py-2 text-center">
            <Link
              href="/chats/"
              onClick={() => setOpen(false)}
              className="text-[11px] font-semibold text-[var(--vauto-teal)]"
            >
              Visi pokalbiai →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/** Extract chat id from a notification deep-link url. */
export function chatIdFromNotificationUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, "https://vauto.local");
    if (parsed.pathname.includes("pokalbiai") || parsed.pathname.includes("chats")) {
      return parsed.searchParams.get("id");
    }
  } catch {
    const m = url.match(/[?&]id=([^&]+)/);
    if (m?.[1]) return decodeURIComponent(m[1]);
  }
  return null;
}
