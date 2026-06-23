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
  enrichNewReport,
} from "@/lib/admin-report-ai";
import {
  apiFetchBannedUsers,
  apiFetchReports,
  apiSetBannedUsers,
  apiSubmitReport,
  apiUpdateListing,
  apiUpdateReportStatus,
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
  ReportStatus,
  SupportReport,
  UserProfile,
} from "@/lib/types";

const ADMIN_POLL_MS = 12_000;

export interface ModerationContextValue {
  reports: SupportReport[];
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
  markReportRead: (reportId: string) => void;
  refreshReports: () => Promise<SupportReport[]>;
  unreadAdminCount: number;
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
  }));
}

export function ModerationProvider({
  deps,
  children,
}: {
  deps: ModerationDeps;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const [reports, setReports] = useState<SupportReport[]>(normalizeReports(DEMO_REPORTS));
  const [bannedUserIds, setBannedUserIds] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const apiActive = isDataApiEnabled();
  const canUseAdminApi = apiActive && user.role === "admin";
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const knownReportIdsRef = useRef<Set<string>>(new Set());

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
    }
    return reports;
  }, [canUseAdminApi, reports]);

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
      } else {
        const storedReports = loadReports();
        if (storedReports?.length) {
          const next = normalizeReports(storedReports);
          setReports(next);
          knownReportIdsRef.current = new Set(next.map((r) => r.id));
        }
        const storedBanned = loadBannedUserIds();
        if (storedBanned?.length) setBannedUserIds(new Set(storedBanned));
      }
      setHydrated(true);
    }
    void load();
  }, [apiActive, canUseAdminApi]);

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

  const resolveReport = useCallback(
    (reportId: string, status: ReportStatus, notify = true) => {
      setReports((prev) =>
        prev.map((r) =>
          r.id === reportId
            ? { ...r, status, unreadByAdmin: false, updatedAt: new Date().toISOString() }
            : r
        )
      );
      if (canUseAdminApi) {
        void apiUpdateReportStatus(reportId, status);
      }
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
      setReports((prev) => [report, ...prev]);
      knownReportIdsRef.current.add(report.id);
      persistReport(report);
      if (depsRef.current.isAdmin) {
        depsRef.current.onNewAdminReport?.(report);
      }
      depsRef.current.showToast(
        "Pranešimas išsiųstas. Gausite atsakymą toje pačioje gijoje.",
        "success"
      );
    },
    [user, persistReport]
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

  const unreadAdminCount = useMemo(
    () => reports.filter((r) => r.status === "open" && r.unreadByAdmin).length,
    [reports]
  );

  const value = useMemo(
    (): ModerationContextValue => ({
      reports,
      bannedUserIds,
      submitReport,
      warnFromReport,
      banFromReport,
      resolveReport,
      replyToReport,
      markReportRead,
      refreshReports,
      unreadAdminCount,
    }),
    [
      reports,
      bannedUserIds,
      submitReport,
      warnFromReport,
      banFromReport,
      resolveReport,
      replyToReport,
      markReportRead,
      refreshReports,
      unreadAdminCount,
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
