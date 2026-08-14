/**
 * In-memory Watch repository — UNIT TESTS ONLY.
 * Production uses AiWatchRepository (PostgreSQL).
 */

import { randomUUID } from "node:crypto";
import {
  parseAiWatchNotification,
  parseAiWatchRule,
  type AiWatchNotification,
  type AiWatchRule,
} from "./schema.js";
import { AI_WATCH_VERSION } from "./version.js";
import type {
  CreateWatchInput,
  WatchRepository,
} from "./watch-repository.js";

export type { CreateWatchInput } from "./watch-repository.js";

export class InMemoryWatchRepository implements WatchRepository {
  private rules = new Map<string, AiWatchRule>();
  private notifications: AiWatchNotification[] = [];
  /** fingerprint ledger: `${userId}::${fingerprint}` */
  private fingerprints = new Set<string>();
  /** simple mutex for race tests */
  private locks = new Map<string, Promise<void>>();

  async withLock<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((r) => {
      release = r;
    });
    this.locks.set(
      key,
      prev.then(() => next)
    );
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  create(input: CreateWatchInput): AiWatchRule {
    const rule = parseAiWatchRule({
      id: randomUUID(),
      userId: input.userId,
      name: input.name,
      type: input.type,
      status: "ACTIVE",
      structuredQuery: input.structuredQuery,
      targetListingId: input.targetListingId,
      thresholds: input.thresholds,
      createdAt: new Date().toISOString(),
      watchVersion: AI_WATCH_VERSION,
    });
    this.rules.set(rule.id, rule);
    return rule;
  }

  /** Strict ownership read. */
  getForUser(ruleId: string, userId: string): AiWatchRule | null {
    const r = this.rules.get(ruleId);
    if (!r || r.userId !== userId || r.status === "DELETED") return null;
    return r;
  }

  listForUser(userId: string): AiWatchRule[] {
    return [...this.rules.values()].filter(
      (r) => r.userId === userId && r.status !== "DELETED"
    );
  }

  /** Active rules across users for event evaluation (server-side only). */
  listActiveRules(): AiWatchRule[] {
    return [...this.rules.values()].filter((r) => r.status === "ACTIVE");
  }

  updateStatus(
    ruleId: string,
    userId: string,
    status: AiWatchRule["status"]
  ): AiWatchRule | null {
    const r = this.getForUser(ruleId, userId);
    if (!r) return null;
    const next = parseAiWatchRule({ ...r, status });
    this.rules.set(ruleId, next);
    return next;
  }

  updateRule(
    ruleId: string,
    userId: string,
    patch: Partial<
      Pick<AiWatchRule, "name" | "thresholds" | "structuredQuery" | "status">
    >
  ): AiWatchRule | null {
    const r = this.getForUser(ruleId, userId);
    if (!r) return null;
    const next = parseAiWatchRule({ ...r, ...patch });
    this.rules.set(ruleId, next);
    return next;
  }

  softDelete(ruleId: string, userId: string): boolean {
    return this.updateStatus(ruleId, userId, "DELETED") != null;
  }

  markEvaluated(ruleId: string, at: string): void {
    const r = this.rules.get(ruleId);
    if (!r) return;
    this.rules.set(ruleId, parseAiWatchRule({ ...r, lastEvaluatedAt: at }));
  }

  markNotified(ruleId: string, at: string): void {
    const r = this.rules.get(ruleId);
    if (!r) return;
    this.rules.set(ruleId, parseAiWatchRule({ ...r, lastNotifiedAt: at }));
  }

  hasFingerprint(userId: string, fingerprint: string): boolean {
    return this.fingerprints.has(`${userId}::${fingerprint}`);
  }

  tryInsertNotification(
    n: Omit<AiWatchNotification, "id" | "watchVersion"> & { id?: string }
  ): AiWatchNotification | null {
    const key = `${n.userId}::${n.eventFingerprint}`;
    if (this.fingerprints.has(key)) return null;
    const row = parseAiWatchNotification({
      id: n.id ?? randomUUID(),
      userId: n.userId,
      ruleId: n.ruleId,
      listingId: n.listingId,
      eventFingerprint: n.eventFingerprint,
      title: n.title,
      body: n.body,
      createdAt: n.createdAt,
      watchVersion: AI_WATCH_VERSION,
    });
    const rule = this.rules.get(row.ruleId);
    if (!rule || rule.userId !== row.userId) return null;
    this.fingerprints.add(key);
    this.notifications.push(row);
    return row;
  }

  listNotificationsForUser(userId: string): AiWatchNotification[] {
    return this.notifications.filter((n) => n.userId === userId);
  }

  countNotificationsForUserSince(userId: string, sinceIso: string): number {
    const since = new Date(sinceIso).getTime();
    return this.notifications.filter(
      (n) => n.userId === userId && new Date(n.createdAt).getTime() >= since
    ).length;
  }

  lastNotificationForRuleListing(
    userId: string,
    ruleId: string,
    listingId: string
  ): AiWatchNotification | null {
    const rows = this.notifications
      .filter(
        (n) =>
          n.userId === userId && n.ruleId === ruleId && n.listingId === listingId
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    return rows[0] ?? null;
  }

  /** Test helper — wipe. */
  clear(): void {
    this.rules.clear();
    this.notifications = [];
    this.fingerprints.clear();
  }
}

/** @deprecated Use InMemoryWatchRepository — alias kept for older unit imports. */
export class WatchStore extends InMemoryWatchRepository {}

export const defaultWatchStore = new InMemoryWatchRepository();
