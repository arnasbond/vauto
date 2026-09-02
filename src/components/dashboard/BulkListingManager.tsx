"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Layers, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { Badge, Button } from "@/design-system";
import type { Listing } from "@/lib/types";
import {
  apiBulkConfirm,
  apiBulkPreview,
  apiBulkRecover,
  type BulkOutcome,
  type BulkPreviewResponse,
} from "@/lib/api/bulk-listings";
import {
  BULK_MAX_TARGETS,
  canUseBulkUi,
  conflictIsDisabled,
  conflictNeedsNewPreview,
  conflictNeedsRecovery,
  formatProposalExpiry,
  proposalClock,
  resultStateFromConfirm,
  selectableListings,
  toggleSelectAllVisible,
  toggleSelection,
  validateSelectionCount,
  type BulkResultUiState,
} from "@/lib/bulk-listing-ui";
import { cn } from "@/lib/cn";

type Operation = "hide" | "republish";

const OPERATION_LABEL: Record<Operation, string> = {
  hide: "Paslėpti",
  republish: "Atkurti",
};

const OPERATION_DESCRIBED: Record<Operation, string> = {
  hide: "Paslėpti pasirinktus skelbimus iš viešo katalogo (atkuriama)",
  republish: "Atkurti paslėptus skelbimus į viešą katalogą",
};

export function BulkListingManager({
  listings,
  actorRole,
  onChanged,
}: {
  listings: Listing[];
  actorRole: string | null | undefined;
  onChanged: () => void;
}) {
  const allowed = canUseBulkUi(actorRole);
  const [operation, setOperation] = useState<Operation>("hide");
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<BulkPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [result, setResult] = useState<BulkResultUiState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const confirmRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    setSelected([]);
    setPreview(null);
    setPreviewError(null);
    setResult({ kind: "idle" });
    setIdempotencyKey("");
  }, [operation]);

  const eligible = useMemo(
    () => selectableListings(listings, operation),
    [listings, operation]
  );

  const visibleSet = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return eligible;
    return eligible.filter((l) =>
      String(l.title ?? "").toLowerCase().includes(q)
    );
  }, [eligible, query]);

  const visibleIds = useMemo(() => visibleSet.map((l) => l.id), [visibleSet]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  const selectedCount = useMemo(() => {
    const eligibleIds = new Set(eligible.map((l) => l.id));
    return selected.filter((id) => eligibleIds.has(id)).length;
  }, [selected, eligible]);

  const selectionCheck = useMemo(
    () => validateSelectionCount(selected),
    [selected]
  );

  if (!allowed) return null;

  const requestPreview = async () => {
    setPreviewError(null);
    const check = validateSelectionCount(selected);
    if (!check.ok) {
      setPreviewError(check.message);
      return;
    }
    setPreviewLoading(true);
    const res = await apiBulkPreview({
      listingIds: [...new Set(selected)],
      operation,
    });
    setPreviewLoading(false);
    if (!res.ok) {
      setPreview(null);
      setPreviewError(res.error);
      setResult({ kind: "idle" });
      return;
    }
    setPreview(res.data);
    setIdempotencyKey(crypto.randomUUID());
    setResult({ kind: "preview" });
    confirmRef.current?.focus();
  };

  const requestConfirm = async () => {
    if (!preview?.digest || !preview.executionEnabled) return;
    setBusy(true);
    setResult({ kind: "confirming" });
    const res = await apiBulkConfirm({
      digest: preview.digest,
      proposalExpiresAt: preview.proposal.expiresAt,
      operation,
      listingIds: [...new Set(selected)],
      idempotencyKey,
    });
    setBusy(false);
    setResult(
      resultStateFromConfirm(
        res.ok ? res.data : null,
        res.ok ? null : res.error
      )
    );
    if (res.ok && res.data?.ok) {
      onChanged();
      window.setTimeout(() => resultsRef.current?.focus(), 0);
    }
  };

  const requestRecovery = async () => {
    if (!idempotencyKey) return;
    setBusy(true);
    const res = await apiBulkRecover({ operation, idempotencyKey });
    setBusy(false);
    setResult(
      resultStateFromConfirm(
        res.ok ? res.data : null,
        res.ok ? null : res.error
      )
    );
    if (res.ok && res.data?.ok) {
      onChanged();
      window.setTimeout(() => resultsRef.current?.focus(), 0);
    }
  };

  const clock = proposalClock(preview, nowMs);
  const disabledGate = preview != null && !preview.executionEnabled;

  return (
    <section
      aria-label="Masiniai skelbimų veiksmai"
      data-bulk-listing-manager
      className="mb-4 rounded-[var(--ds-radius-card)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <Layers className="h-4 w-4 text-[var(--ds-brand)]" aria-hidden />
        <h2 className="text-sm font-semibold text-[var(--ds-text-primary)]">
          Masiniai veiksmai
        </h2>
        {selectedCount > 0 ? (
          <Badge tone="brand" data-selected-count>
            {selectedCount} pasirinkta
          </Badge>
        ) : null}
      </div>

      <div
        role="radiogroup"
        aria-label="Masinio veiksmo pasirinkimas"
        className="mb-3 flex flex-wrap gap-2"
      >
        {(["hide", "republish"] as const).map((op) => {
          const count = selectableListings(listings, op).length;
          return (
            <button
              key={op}
              type="button"
              role="radio"
              aria-checked={operation === op}
              onClick={() => setOperation(op)}
              className={cn(
                "rounded-[var(--ds-radius-control)] border px-3 py-1.5 text-xs font-semibold",
                operation === op
                  ? "border-[var(--ds-brand)] bg-[var(--ds-brand-soft)] text-[var(--ds-brand-strong)]"
                  : "border-[var(--ds-border-subtle)] text-[var(--ds-text-secondary)]"
              )}
            >
              {OPERATION_LABEL[op]} ({count})
            </button>
          );
        })}
      </div>
      <p className="mb-3 text-xs text-[var(--ds-text-muted)]">
        {OPERATION_DESCRIBED[operation]}. Pasirinkimas galioja tik šiame
        matomame sąraše.
      </p>

      {eligible.length === 0 ? (
        <p className="rounded-lg bg-[var(--ds-surface-muted)] px-3 py-4 text-center text-xs text-[var(--ds-text-muted)]" data-bulk-empty>
          {operation === "hide"
            ? "Nėra matomų skelbimų, kuriuos būtų galima paslėpti."
            : "Nėra paslėptų skelbimų, kuriuos būtų galima atkurti."}
        </p>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-[var(--ds-surface-muted)] px-3 py-2">
            <Search className="h-3.5 w-3.5 text-[var(--ds-text-muted)]" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtruoti sąrašą…"
              aria-label="Filtruoti skelbimus"
              className="w-full bg-transparent text-xs text-[var(--ds-text-primary)] outline-none placeholder:text-[var(--ds-text-muted)]"
            />
          </div>

          <div className="mb-2 flex items-center justify-between gap-2">
            <label
              htmlFor="bulk-select-all"
              className="flex items-center gap-2 text-xs text-[var(--ds-text-secondary)]"
            >
              <input
                id="bulk-select-all"
                type="checkbox"
                className="h-4 w-4 shrink-0"
                checked={allVisibleSelected}
                onChange={() =>
                  setSelected((cur) =>
                    toggleSelectAllVisible(visibleIds, cur, operation, listings)
                  )
                }
                aria-label="Pasirinkti visus matomame sąraše"
              />
              Pasirinkti visus matomus ({visibleIds.length})
            </label>
            {selected.length > BULK_MAX_TARGETS ? (
              <span
                role="alert"
                className="text-xs font-semibold text-[var(--ds-danger)]"
              >
                Pasirinkta per daug (daugiausia {BULK_MAX_TARGETS})
              </span>
            ) : null}
          </div>

          <ul className="max-h-72 space-y-1 overflow-y-auto pr-1" role="list">
            {visibleSet.map((l) => {
              const checked = selected.includes(l.id);
              return (
                <li key={l.id}>
                  <label
                    htmlFor={`bulk-listing-${l.id}`}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-[var(--ds-surface-muted)]"
                  >
                    <input
                      id={`bulk-listing-${l.id}`}
                      type="checkbox"
                      className="h-4 w-4 shrink-0"
                      checked={checked}
                      onChange={() =>
                        setSelected((cur) => toggleSelection(l.id, cur))
                      }
                      aria-label={`Pasirinkti: ${l.title}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-[var(--ds-text-primary)]">
                      {l.title}
                    </span>
                    <Badge
                      tone={
                        String(l.status) === "deleted" ? "neutral" : "brand"
                      }
                    >
                      {String(l.status)}
                    </Badge>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={
            !selectionCheck.ok || previewLoading || busy || eligible.length === 0
          }
          onClick={() => void requestPreview()}
          data-bulk-preview
        >
          {previewLoading ? "Ruošiama…" : "Peržiūrėti preview"}
        </Button>
        {selectedCount > 0 ? (
          <button
            type="button"
            onClick={() => setSelected([])}
            className="text-xs text-[var(--ds-text-muted)] underline"
          >
            Išvalyti pasirinkimą
          </button>
        ) : null}
      </div>

      {previewError ? (
        <p role="alert" className="mt-2 text-xs text-[var(--ds-danger)]">
          {previewError}
        </p>
      ) : null}

      {preview ? (
        <div
          ref={confirmRef}
          tabIndex={-1}
          className="mt-3 rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-muted)] p-3 outline-none"
          aria-label="Masinio veiksmo patvirtinimas"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-text-secondary)]">
              Preview prieš vykdymą
            </h3>
            {clock.kind === "fresh" && preview.executionEnabled ? (
              <span
                className="font-mono text-xs text-[var(--ds-text-muted)]"
                aria-live="polite"
              >
                Galioja: {formatProposalExpiry(clock.expiresAt, nowMs)}
              </span>
            ) : null}
          </div>

          {disabledGate ? (
            <div
              role="status"
              className="mb-2 flex items-start gap-2 rounded-lg bg-[var(--ds-warning-soft)] px-3 py-2 text-xs text-[var(--ds-text-primary)]"
            >
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ds-warning)]" aria-hidden />
              <span>
                Funkcija šiuo metu neaktyvi — vykdymas serverio išjungtas. Šis
                preview yra tik informacinis; jokie veiksmai nebus įvykdyti.
              </span>
            </div>
          ) : null}

          {preview.proposal.ownedCount > 0 ? (
            <p className="mb-1 text-xs text-[var(--ds-text-primary)]">
              Bus {OPERATION_LABEL[operation].toLowerCase()}{" "}
              <strong>{preview.proposal.ownedCount}</strong> skelbimų.
            </p>
          ) : null}

          {preview.proposal.warnings.length > 0 ? (
            <ul className="mb-2 list-inside list-disc space-y-0.5 text-xs text-[var(--ds-text-muted)]">
              {preview.proposal.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}

          {clock.kind === "expired" ? (
            <p
              role="alert"
              className="mb-2 text-xs font-semibold text-[var(--ds-danger)]"
            >
              Preview galiojimas pasibaigė — atnaujinkite jį prieš patvirtinant.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              variant={operation === "hide" ? "danger" : "primary"}
              size="sm"
              disabled={
                busy ||
                disabledGate ||
                clock.kind === "expired" ||
                !preview.digest
              }
              onClick={() => void requestConfirm()}
              data-bulk-confirm
            >
              {busy
                ? "Vykdoma…"
                : `${OPERATION_LABEL[operation]} ${preview.proposal.ownedCount} skelbimų`}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void requestPreview()}
            >
              Atnaujinti preview
            </Button>
          </div>
          <p className="mt-2 text-[10px] text-[var(--ds-text-muted)]">
            Patvirtinus veiksmas bus įvykdytas atkakliai (idempotentiškai) su
            audito įrašu. {operation === "hide"
              ? "Paslėptus skelbimus galėsite atkurti."
              : "Atkurti skelbimai vėl taps matomi kataloge."}
          </p>
        </div>
      ) : null}

      {result.kind === "done" ? (
        <div
          ref={resultsRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          className="mt-3 rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-muted)] p-3 outline-none"
          data-bulk-results
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-text-secondary)]">
              Rezultatai
            </h3>
            <Badge tone="success">Sėkmingai: {result.summary.success}</Badge>
            {result.summary.failed > 0 ? (
              <Badge tone="danger">Nepavyko: {result.summary.failed}</Badge>
            ) : null}
            {result.summary.skipped > 0 ? (
              <Badge tone="neutral">Praleista: {result.summary.skipped}</Badge>
            ) : null}
            {result.replayed ? (
              <Badge tone="neutral">Pakartota operacija — parodytas išsaugotas rezultatas</Badge>
            ) : null}
          </div>
          {result.summary.isPartialFailure ? (
            <p className="mb-2 rounded-lg bg-[var(--ds-warning-soft)] px-3 py-2 text-xs text-[var(--ds-text-primary)]">
              Dalinė nesėkmė: {result.summary.success} pavyko,{" "}
              {result.summary.failed} nepavyko. Nepavykusius galite pakartoti
              atskirai.
            </p>
          ) : null}
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {result.outcomes.map((o) => (
              <OutcomeRow key={o.id} outcome={o} listings={listings} />
            ))}
          </ul>
        </div>
      ) : null}

      {result.kind === "confirming" ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 text-xs text-[var(--ds-text-muted)]"
        >
          Vykdoma… tai gali užtrukti, kol apdorojami visi skelbimai.
        </p>
      ) : null}

      {result.kind === "conflict" ? (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-muted)] p-3"
          data-bulk-conflict={result.code}
        >
          <p className="mb-2 text-xs font-semibold text-[var(--ds-text-primary)]">
            {conflictMessage(result.code)} (kodas: {result.code})
          </p>
          <p className="mb-2 text-xs text-[var(--ds-text-muted)]">
            {result.message}
          </p>
          <div className="flex flex-wrap gap-2">
            {conflictNeedsRecovery(result.code) && idempotencyKey ? (
              <Button
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={() => void requestRecovery()}
                data-bulk-recover
              >
                <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden />
                Atkurti operaciją
              </Button>
            ) : null}
            {conflictNeedsNewPreview(result.code) ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void requestPreview()}
              >
                Atnaujinti preview
              </Button>
            ) : null}
            {conflictIsDisabled(result.code) ? (
              <p className="text-xs text-[var(--ds-text-muted)]">
                Funkcija neaktyvi — jokie veiksmai nebuvo įvykdyti.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function conflictMessage(code: string | undefined): string {
  switch (code) {
    case "in_progress":
      return "Operacija jau vykdoma kitame lange ar įrenginyje.";
    case "recovery_required":
      return "Operacija buvo nutraukta — reikalingas saugus atkūrimas.";
    case "fenced":
      return "Operaciją perėmė kitas procesas — šis langas nebegali jos vykdyti.";
    case "expired":
      return "Preview pasibaigė.";
    case "tampered":
      return "Pasirinkimas pasikeitė po preview sukūrimo.";
    case "disabled":
      return "Funkcija išjungta.";
    case "unauthorized":
      return "Neturite teisių šiam veiksmui.";
    default:
      return "Operacija nepavyko.";
  }
}

function OutcomeRow({
  outcome,
  listings,
}: {
  outcome: BulkOutcome;
  listings: Listing[];
}) {
  const title =
    listings.find((l) => l.id === outcome.id)?.title ?? outcome.id;
  return (
    <li className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs">
      {outcome.status === "success" ? (
        <Badge tone="success">✓</Badge>
      ) : outcome.status === "failed" ? (
        <Badge tone="danger">✕</Badge>
      ) : (
        <Badge tone="neutral">−</Badge>
      )}
      <span className="min-w-0 flex-1 truncate text-[var(--ds-text-primary)]">
        {title}
      </span>
      <span className="text-[var(--ds-text-muted)]">
        {outcome.status === "success"
          ? outcome.detail ?? "sėkmingai"
          : outcome.status === "failed"
            ? outcome.reason ?? "nepavyko"
            : outcome.reason ?? "praleista"}
      </span>
    </li>
  );
}
