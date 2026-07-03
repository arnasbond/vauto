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
import { useRouter } from "next/navigation";
import {
  apiFetchUserNotifications,
  apiMarkAllNotificationsRead,
  apiMarkNotificationRead,
  type UserNotification,
} from "@/lib/api/client";
import { bellPollInterval } from "@/lib/notification-bell-poll";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import { useVautoBridge } from "@/context/VautoBridge";
import { countUnreadChats } from "@/lib/chat-helpers";

export interface NotificationBellContextValue {
  notifications: UserNotification[];
  dbUnreadCount: number;
  chatUnreadCount: number;
  totalUnreadCount: number;
  loading: boolean;
  pushDenied: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  openNotification: (notification: UserNotification) => Promise<void>;
}

const NotificationBellContext = createContext<NotificationBellContextValue | null>(
  null
);

export function NotificationBellProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const { apiActive } = useVautoBridge();
  const { chats } = useChat();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [pushDenied, setPushDenied] = useState(false);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const chatUnreadCount = useMemo(
    () => (isAuthenticated ? countUnreadChats(chats, user.id) : 0),
    [chats, isAuthenticated, user.id]
  );

  const dbUnreadCount = useMemo(
    () => notifications.filter((n) => !n.readAt).length,
    [notifications]
  );

  const totalUnreadCount = dbUnreadCount + chatUnreadCount;

  const refresh = useCallback(async () => {
    if (!apiActive || !isAuthenticated || user.id === "guest") return;
    setLoading(true);
    try {
      const res = await apiFetchUserNotifications(user.id, 40);
      if (res.ok && res.data?.notifications) {
        setNotifications(res.data.notifications);
        knownIdsRef.current = new Set(res.data.notifications.map((n) => n.id));
      }
    } finally {
      setLoading(false);
    }
  }, [apiActive, isAuthenticated, user.id]);

  const markRead = useCallback(
    async (id: string) => {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n
        )
      );
      if (apiActive && user.id !== "guest") {
        await apiMarkNotificationRead(id, user.id);
      }
    },
    [apiActive, user.id]
  );

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? now })));
    if (apiActive && user.id !== "guest") {
      await apiMarkAllNotificationsRead(user.id);
    }
  }, [apiActive, user.id]);

  const openNotification = useCallback(
    async (notification: UserNotification) => {
      await markRead(notification.id);
      const url = notification.url?.trim();
      if (url) {
        router.push(url);
      }
    },
    [markRead, router]
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPushDenied(true);
      return;
    }
    setPushDenied(Notification.permission === "denied");
  }, []);

  useEffect(() => {
    if (!apiActive || !isAuthenticated || user.id === "guest") return;

    void refresh();

    const schedule = () => {
      if (pollRef.current) clearInterval(pollRef.current);
      const ms = bellPollInterval(
        typeof Notification !== "undefined" ? Notification.permission : "denied"
      );
      pollRef.current = setInterval(() => void refresh(), ms);
    };

    schedule();

    const onWake = () => {
      void refresh();
      schedule();
    };

    window.addEventListener("online", onWake);
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("vauto-notifications-refresh", onWake);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      window.removeEventListener("online", onWake);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("vauto-notifications-refresh", onWake);
    };
  }, [apiActive, isAuthenticated, user.id, refresh]);

  const value = useMemo(
    (): NotificationBellContextValue => ({
      notifications,
      dbUnreadCount,
      chatUnreadCount,
      totalUnreadCount,
      loading,
      pushDenied,
      refresh,
      markRead,
      markAllRead,
      openNotification,
    }),
    [
      notifications,
      dbUnreadCount,
      chatUnreadCount,
      totalUnreadCount,
      loading,
      pushDenied,
      refresh,
      markRead,
      markAllRead,
      openNotification,
    ]
  );

  return (
    <NotificationBellContext.Provider value={value}>
      {children}
    </NotificationBellContext.Provider>
  );
}

export function useNotificationBell(): NotificationBellContextValue {
  const ctx = useContext(NotificationBellContext);
  if (!ctx) {
    throw new Error("useNotificationBell must be used within NotificationBellProvider");
  }
  return ctx;
}
