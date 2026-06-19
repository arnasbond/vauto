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
  apiFetchBannedUsers,
  apiFetchReports,
  apiSetBannedUsers,
  apiSubmitReport,
  apiUpdateListing,
  apiUpdateReportStatus,
  apiWarnUser,
} from "@/lib/api/client";
import { isDataApiEnabled } from "@/lib/api/config";
import { categoryToUrgency } from "@/lib/reports";
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
}

const ModerationContext = createContext<ModerationContextValue | null>(null);

export function ModerationProvider({
  deps,
  children,
}: {
  deps: ModerationDeps;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const [reports, setReports] = useState<SupportReport[]>(DEMO_REPORTS);
  const [bannedUserIds, setBannedUserIds] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const apiActive = isDataApiEnabled();
  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    async function load() {
      if (apiActive) {
        const [reportsRes, bannedRes] = await Promise.all([
          apiFetchReports(),
          apiFetchBannedUsers(),
        ]);
        if (reportsRes.ok && reportsRes.data.length) {
          setReports(reportsRes.data);
        } else if (reportsRes.ok) {
          setReports(DEMO_REPORTS);
        }
        if (bannedRes.ok) setBannedUserIds(new Set(bannedRes.data));
      } else {
        const storedReports = loadReports();
        if (storedReports?.length) setReports(storedReports);
        const storedBanned = loadBannedUserIds();
        if (storedBanned?.length) setBannedUserIds(new Set(storedBanned));
      }
      setHydrated(true);
    }
    void load();
  }, [apiActive]);

  useEffect(() => {
    if (!hydrated || apiActive) return;
    saveReports(reports);
  }, [reports, hydrated, apiActive]);

  useEffect(() => {
    if (!hydrated || apiActive) return;
    saveBannedUserIds(Array.from(bannedUserIds));
  }, [bannedUserIds, hydrated, apiActive]);

  const resolveReport = useCallback(
    (reportId: string, status: ReportStatus, notify = true) => {
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status } : r))
      );
      if (apiActive) {
        void apiUpdateReportStatus(reportId, status);
      }
      if (notify) {
        depsRef.current.showToast(
          status === "resolved" ? "Pranešimas uždarytas" : "Pranešimas atmestas",
          "success"
        );
      }
    },
    [apiActive]
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
      const report: SupportReport = {
        id: `rep-${Date.now()}`,
        reporterId: user.id,
        reporterName: user.name,
        category: data.category,
        urgency: categoryToUrgency(data.category),
        status: "open",
        comment: data.comment,
        listingId: data.listingId,
        listingTitle: data.listingTitle,
        chatId: data.chatId,
        reportedUserId: data.reportedUserId,
        chatPreview: data.chatPreview,
        createdAt: new Date().toISOString(),
      };
      setReports((prev) => [report, ...prev]);
      if (apiActive) {
        void apiSubmitReport(report).then((r) => {
          if (!r.ok) {
            depsRef.current.setSyncError(`Pranešimas neišsaugotas: ${r.error}`);
          }
        });
      }
    },
    [user.id, user.name, apiActive]
  );

  const warnFromReport = useCallback(
    (reportId: string) => {
      const report = reports.find((r) => r.id === reportId);
      if (!report) return;
      if (report.reportedUserId) {
        if (report.reportedUserId === user.id) {
          depsRef.current.patchAuthUser({ warned: true });
        }
        if (apiActive) {
          void apiWarnUser(report.reportedUserId);
        }
      }
      resolveReport(reportId, "resolved", false);
      depsRef.current.showToast("Vartotojas įspėtas", "success");
    },
    [reports, resolveReport, user.id, apiActive]
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
          if (apiActive) {
            void apiSetBannedUsers(Array.from(next));
          }
          return next;
        });
        depsRef.current.onBanSeller(report.reportedUserId);
      }

      if (report.listingId && apiActive) {
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
    [reports, resolveReport, apiActive]
  );

  const value = useMemo(
    (): ModerationContextValue => ({
      reports,
      bannedUserIds,
      submitReport,
      warnFromReport,
      banFromReport,
      resolveReport,
    }),
    [
      reports,
      bannedUserIds,
      submitReport,
      warnFromReport,
      banFromReport,
      resolveReport,
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
