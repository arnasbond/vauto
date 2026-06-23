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
  type RefObject,
} from "react";
import { DEMO_REPORTS } from "@/data/mockReports";
import { useAuth } from "@/context/AuthContext";
import {
  appendAdminReply,
  appendUserReply,
  enrichNewReport,
} from "@/lib/admin-report-ai";
import {
  apiFetchBannedUsers,
  apiFetchMyReports,
  apiFetchReports,
  apiPatchMyReport,
  apiSetBannedUsers,
  apiSubmitReport,
  apiUpdateListing,
  apiUpsertReport,
  apiWarnUser,
} from "@/lib/api/client";
import { isDataApiEnabled } from "@/lib/api/config";
import {
  loadBannedUserIds,
  loadReports,
  saveBannedUserIds,
  saveReports,
} from "@/lib/storage";
import type {
  Listing,
  ReportCategory,
  ReportMessage,
  ReportStatus,
  SupportReport,
  UserProfile,
} from "@/lib/types";

const ADMIN_POLL_MS = 5_000;
const USER_POLL_MS = 8_000;

export interface ModerationContextValue {
  reports: SupportReport[];
  myReports: SupportReport[];
  bannedUserIds: Set<string>;
  submitReport: (data: {
    category: ReportCategory;
    comment: string;
    listingId?: string;
    listingTitle?: string;
    chatId?: string;
    reportedUserId?: string;
    chatPreview?: string;
  }) => void;
  warnFromReport: (reportId: string) => void;
  banFromReport: (reportId: string) => void;
  resolveReport: (reportId: string, status: ReportStatus) => void;
  replyToReport: (reportId: string, text: string, options?: { auto?: boolean }) => void;
  followUpReport: (reportId: string, text: string) => void;
  markReportRead: (reportId: string) => void;
  markMyReportRead: (reportId: string) => void;
  refreshReports: () => Promise<SupportReport[]>;
  refreshMyReports: () => Promise<SupportReport[]>;
  unreadAdminCount: number;
  unreadUserReportCount: number;
}

export interface ModerationDeps {
  listingsRef: RefObject<Listing[]>;
  onBanListing: (listingId: string) => void;
  onBanSeller: (sellerId: string) => void;
  setSyncError: (msg: string | null) => void;
  showToast: (
    message: string,
    type: "success" | "error" | "info" | "buddy"
  ) => void;
  patchAuthUser: (patch: Partial<UserProfile>) => void;
  isAdmin: boolean;
  onNewAdminReport?: (report: SupportReport) => void;
  onNewUserReportReply?: (report: SupportReport, preview: string) => void;
}

const ModerationContext = createContext<ModerationContextValue | null>(null);

function normalizeReports(reports: SupportReport[]): SupportReport[] {
  return reports.map((r) => ({
    ...r,
    messages: r.messages ?? [
      {
        id: `${r.id}-initial`,
        senderId: r.reporterId,
        senderName: r.reporterName,
        role: "user" as const,
        text: r.comment,
        timestamp: r.createdAt,
      },
    ],
    unreadByAdmin: r.unreadByAdmin ?? r.status === "open",
    unreadByReporter: r.unreadByReporter ?? false,
  }));
}

function messageCount(report: SupportReport): number {
  return report.messages?.length ?? 0;
}

function lastNonUserMessage(report: SupportReport): ReportMessage | undefined {
  const msgs = report.messages ?? [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role !== "user") return msgs[i];
  }
  return undefined;
}

export function ModerationProvider({
  deps,
  children,
}: {
  deps: ModerationDeps;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const [reports, setReports] = useState<SupportReport[]>([]);
  const [bannedUserIds, setBannedUserIds] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const apiActive = isDataApiEnabled();
  const canUseAdminApi = apiActive && user.role === "admin";
  const canUseReporterApi = apiActive && !!user.id && !canUseAdminApi;
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const knownReportIdsRef = useRef<Set<string>>(new Set());
  const userReportSnapshotRef = useRef<Map<string, { count: number; updatedAt?: string }>>(
    new Map()
  );

  const snapshotUserReports = useCallback((items: SupportReport[]) => {
    userReportSnapshotRef.current = new Map(
      items.map((r) => [
        r.id,
        { count: messageCount(r), updatedAt: r.updatedAt ?? r.createdAt },
      ])
    );
  }, []);

  const detectUserReplyUpdates = useCallback(
    (next: SupportReport[]) => {
      const prev = userReportSnapshotRef.current;
      for (const report of next) {
        const old = prev.get(report.id);
        const count = messageCount(report);
        const updatedAt = report.updatedAt ?? report.createdAt;
        const hasNewMessages =
          old && (count > old.count || updatedAt !== old.updatedAt);
        if (hasNewMessages && report.unreadByReporter) {
          const last = lastNonUserMessage(report);
          if (last) {
            depsRef.current.onNewUserReportReply?.(report, last.text);
          }
        }
      }
      snapshotUserReports(next);
    },
    [snapshotUserReports]
  );

  const refreshMyReports = useCallback(async (): Promise<SupportReport[]> => {
    if (canUseReporterApi) {
      const res = await apiFetchMyReports(user.id);
      if (res.ok) {
        const next = normalizeReports(res.data);
        detectUserReplyUpdates(next);
        setReports(next);
        return next;
      }
    } else if (!depsRef.current.isAdmin) {
      const stored = loadReports()?.filter((r) => r.reporterId === user.id) ?? [];
      const demo = DEMO_REPORTS.filter((r) => r.reporterId === user.id);
      const byId = new Map<string, SupportReport>();
      for (const r of [...demo, ...stored]) byId.set(r.id, r);
      const next = normalizeReports([...byId.values()]);
      detectUserReplyUpdates(next);
      setReports(next);
      return next;
    }
    return reports.filter((r) => r.reporterId === user.id);
  }, [canUseReporterApi, user.id, detectUserReplyUpdates, reports]);

  const refreshReports = useCallback(async (): Promise<SupportReport[]> => {
    if (canUseAdminApi) {
      const reportsRes = await apiFetchReports();
      if (reportsRes.ok) {
        const next = normalizeReports(
          reportsRes.data.length ? reportsRes.data : DEMO_REPORTS
        );
        setReports(next);
        return next;
      }
    } else if (depsRef.current.isAdmin) {
      const stored = loadReports();
      if (stored?.length) {
        const next = normalizeReports(stored);
        setReports(next);
        return next;
      }
      const next = normalizeReports(DEMO_REPORTS);
      setReports(next);
      return next;
    }
    return refreshMyReports();
  }, [canUseAdminApi, refreshMyReports]);

  useEffect(() => {
    async function load() {
      if (canUseAdminApi) {
        const [reportsRes, bannedRes] = await Promise.all([
          apiFetchReports(),
          apiFetchBannedUsers(),
        ]);
        if (reportsRes.ok) {
          const next = normalizeReports(
            reportsRes.data.length ? reportsRes.data : DEMO_REPORTS
          );
          setReports(next);
          knownReportIdsRef.current = new Set(next.map((r) => r.id));
        }
        if (bannedRes.ok) setBannedUserIds(new Set(bannedRes.data));
      } else if (depsRef.current.isAdmin) {
        const storedReports = loadReports();
        const next = normalizeReports(
          storedReports?.length ? storedReports : DEMO_REPORTS
        );
        setReports(next);
        knownReportIdsRef.current = new Set(next.map((r) => r.id));
        const storedBanned = loadBannedUserIds();
        if (storedBanned?.length) setBannedUserIds(new Set(storedBanned));
      } else if (canUseReporterApi) {
        const res = await apiFetchMyReports(user.id);
        if (res.ok) {
          const next = normalizeReports(res.data);
          setReports(next);
          snapshotUserReports(next);
        }
      } else {
        const storedReports =
          loadReports()?.filter((r) => r.reporterId === user.id) ?? [];
        const demo = DEMO_REPORTS.filter((r) => r.reporterId === user.id);
        const byId = new Map<string, SupportReport>();
        for (const r of [...demo, ...storedReports]) byId.set(r.id, r);
        const next = normalizeReports([...byId.values()]);
        setReports(next);
        snapshotUserReports(next);
        const storedBanned = loadBannedUserIds();
        if (storedBanned?.length) setBannedUserIds(new Set(storedBanned));
      }
      setHydrated(true);
    }
    void load();
  }, [apiActive, canUseAdminApi, canUseReporterApi, user.id, snapshotUserReports]);

  useEffect(() => {
    if (!hydrated || apiActive) return;
    saveReports(reports);
  }, [reports, hydrated, apiActive]);

  useEffect(() => {
    if (!hydrated || apiActive) return;
    saveBannedUserIds(Array.from(bannedUserIds));
  }, [bannedUserIds, hydrated, apiActive]);

  useEffect(() => {
    if (!deps.isAdmin || !hydrated) return;

    const poll = async () => {
      const prevIds = knownReportIdsRef.current;
      const next = await refreshReports();
      const newOnes = next.filter(
        (r) => r.status === "open" && !prevIds.has(r.id)
      );
      knownReportIdsRef.current = new Set(next.map((r) => r.id));
      for (const report of newOnes) {
        depsRef.current.onNewAdminReport?.(report);
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), ADMIN_POLL_MS);
    return () => window.clearInterval(timer);
  }, [deps.isAdmin, hydrated, refreshReports]);

  useEffect(() => {
    if (deps.isAdmin || !hydrated || !user.id) return;

    const poll = async () => {
      await refreshMyReports();
    };

    void poll();
    const timer = window.setInterval(() => void poll(), USER_POLL_MS);
    return () => window.clearInterval(timer);
  }, [deps.isAdmin, hydrated, user.id, refreshMyReports]);

  const persistReport = useCallback(
    (report: SupportReport) => {
      if (canUseAdminApi) {
        void apiUpsertReport(report);
      } else if (apiActive) {
        void apiSubmitReport(report);
      }
    },
    [apiActive, canUseAdminApi]
  );

  const persistMyReport = useCallback(
    (report: SupportReport) => {
      if (canUseReporterApi) {
        void apiPatchMyReport(report, user.id);
      }
    },
    [canUseReporterApi, user.id]
  );

  const resolveReport = useCallback(
    (reportId: string, status: ReportStatus, notify = true) => {
      setReports((prev) => {
        const next = prev.map((r) =>
          r.id === reportId
            ? {
                ...r,
                status,
                unreadByAdmin: false,
                unreadByReporter: true,
                updatedAt: new Date().toISOString(),
              }
            : r
        );
        const updated = next.find((r) => r.id === reportId);
        if (updated && canUseAdminApi) {
          void apiUpsertReport(updated);
        }
        return next;
      });
      if (notify) {
        depsRef.current.showToast(
          status === "resolved" ? "Pranešimas uždarytas" : "Pranešimas atmestas",
          "success"
        );
      }
    },
    [canUseAdminApi]
  );

  const submitReport = useCallback(
    (data: {
      category: ReportCategory;
      comment: string;
      listingId?: string;
      listingTitle?: string;
      chatId?: string;
      reportedUserId?: string;
      chatPreview?: string;
    }) => {
      const report = enrichNewReport(data, user);
      setReports((prev) => {
        const next = [report, ...prev];
        snapshotUserReports(next.filter((r) => r.reporterId === user.id));
        return next;
      });
      knownReportIdsRef.current.add(report.id);
      persistReport(report);
      if (depsRef.current.isAdmin) {
        depsRef.current.onNewAdminReport?.(report);
      }
      depsRef.current.showToast(
        "Pranešimas išsiųstas. Atsakymą rasite profilyje — Mano pranešimai.",
        "success"
      );
    },
    [user, persistReport, snapshotUserReports]
  );

  const replyToReport = useCallback(
    (reportId: string, text: string, options?: { auto?: boolean }) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setReports((prev) => {
        const report = prev.find((r) => r.id === reportId);
        if (!report) return prev;
        const updated = appendAdminReply(report, user, trimmed, options?.auto);
        persistReport(updated);
        return prev.map((r) => (r.id === reportId ? updated : r));
      });
      depsRef.current.showToast("Atsakymas išsiųstas vartotojui", "success");
    },
    [user, persistReport]
  );

  const followUpReport = useCallback(
    (reportId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setReports((prev) => {
        const report = prev.find((r) => r.id === reportId);
        if (!report || report.reporterId !== user.id) return prev;
        const updated = appendUserReply(report, user, trimmed);
        persistMyReport(updated);
        if (!canUseReporterApi) persistReport(updated);
        return prev.map((r) => (r.id === reportId ? updated : r));
      });
      depsRef.current.showToast("Papildymas išsiųstas", "success");
    },
    [user, persistMyReport, persistReport, canUseReporterApi]
  );

  const markReportRead = useCallback(
    (reportId: string) => {
      setReports((prev) => {
        const next = prev.map((r) =>
          r.id === reportId ? { ...r, unreadByAdmin: false } : r
        );
        const report = next.find((r) => r.id === reportId);
        if (report && canUseAdminApi) {
          void apiUpsertReport({ ...report, unreadByAdmin: false });
        }
        return next;
      });
    },
    [canUseAdminApi]
  );

  const markMyReportRead = useCallback(
    (reportId: string) => {
      setReports((prev) => {
        const next = prev.map((r) =>
          r.id === reportId ? { ...r, unreadByReporter: false } : r
        );
        const report = next.find((r) => r.id === reportId);
        if (report) {
          persistMyReport({ ...report, unreadByReporter: false });
        }
        return next;
      });
    },
    [persistMyReport]
  );

  const warnFromReport = useCallback(
    (reportId: string) => {
      const report = reports.find((r) => r.id === reportId);
      if (!report) return;
      if (report.reportedUserId) {
        if (report.reportedUserId === user.id) {
          depsRef.current.patchAuthUser({ warned: true });
        }
        if (canUseAdminApi) {
          void apiWarnUser(report.reportedUserId);
        }
      }
      resolveReport(reportId, "resolved", false);
      depsRef.current.showToast("Vartotojas įspėtas", "success");
    },
    [reports, resolveReport, user.id, canUseAdminApi]
  );

  const banFromReport = useCallback(
    (reportId: string) => {
      const report = reports.find((r) => r.id === reportId);
      if (!report) return;

      if (report.listingId) {
        depsRef.current.onBanListing(report.listingId);
      }

      if (report.reportedUserId) {
        setBannedUserIds((prev) => {
          const next = new Set(prev).add(report.reportedUserId!);
          if (canUseAdminApi) {
            void apiSetBannedUsers(Array.from(next));
          }
          return next;
        });
        depsRef.current.onBanSeller(report.reportedUserId);
      }

      if (report.listingId && canUseAdminApi) {
        const listing = depsRef.current.listingsRef.current?.find(
          (l) => l.id === report.listingId
        );
        if (listing) {
          void apiUpdateListing(listing.id, listing.sellerId, { banned: true });
        }
      }

      resolveReport(reportId, "resolved", false);
      depsRef.current.showToast("Skelbimas/vartotojas užblokuotas", "success");
    },
    [reports, resolveReport, canUseAdminApi]
  );

  const myReports = useMemo(
    () =>
      reports
        .filter((r) => r.reporterId === user.id)
        .sort(
          (a, b) =>
            new Date(b.updatedAt ?? b.createdAt).getTime() -
            new Date(a.updatedAt ?? a.createdAt).getTime()
        ),
    [reports, user.id]
  );

  const unreadAdminCount = useMemo(
    () => reports.filter((r) => r.status === "open" && r.unreadByAdmin).length,
    [reports]
  );

  const unreadUserReportCount = useMemo(
    () => myReports.filter((r) => r.unreadByReporter).length,
    [myReports]
  );

  const value = useMemo(
    (): ModerationContextValue => ({
      reports,
      myReports,
      bannedUserIds,
      submitReport,
      warnFromReport,
      banFromReport,
      resolveReport,
      replyToReport,
      followUpReport,
      markReportRead,
      markMyReportRead,
      refreshReports,
      refreshMyReports,
      unreadAdminCount,
      unreadUserReportCount,
    }),
    [
      reports,
      myReports,
      bannedUserIds,
      submitReport,
      warnFromReport,
      banFromReport,
      resolveReport,
      replyToReport,
      followUpReport,
      markReportRead,
      markMyReportRead,
      refreshReports,
      refreshMyReports,
      unreadAdminCount,
      unreadUserReportCount,
    ]
  );

  return (
    <ModerationContext.Provider value={value}>
      {children}
    </ModerationContext.Provider>
  );
}

export function useModeration(): ModerationContextValue {
  const ctx = useContext(ModerationContext);
  if (!ctx) {
    throw new Error("useModeration must be used within ModerationProvider");
  }
  return ctx;
}
