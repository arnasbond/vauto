"use client";

import { useMemo, useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { apiUpdateUser } from "@/lib/api/client";
import { isDataApiEnabled } from "@/lib/api/config";
import { sanitizeAvatarForApi } from "@/lib/avatar-url";
import {
  DEFAULT_BUSINESS_HOURS,
  formatBusinessHoursSummary,
  type BusinessHours,
  type DayHours,
} from "@vauto/shared/business-hours";

function weekdayTemplate(hours?: BusinessHours | null): {
  open: string;
  close: string;
  weekendOpen: boolean;
  satOpen: string;
  satClose: string;
} {
  const map = hours && Object.keys(hours).length ? hours : DEFAULT_BUSINESS_HOURS;
  const fri = map.fri ?? DEFAULT_BUSINESS_HOURS.fri!;
  const sat = map.sat ?? DEFAULT_BUSINESS_HOURS.sat!;
  return {
    open: fri.open || "09:00",
    close: fri.close || "18:00",
    weekendOpen: Boolean(sat && !sat.closed),
    satOpen: sat.open || "10:00",
    satClose: sat.close || "14:00",
  };
}

function buildHours(input: {
  open: string;
  close: string;
  weekendOpen: boolean;
  satOpen: string;
  satClose: string;
}): BusinessHours {
  const weekday: DayHours = { open: input.open, close: input.close };
  const closed: DayHours = { open: "00:00", close: "00:00", closed: true };
  return {
    mon: weekday,
    tue: weekday,
    wed: weekday,
    thu: weekday,
    fri: weekday,
    sat: input.weekendOpen
      ? { open: input.satOpen, close: input.satClose }
      : closed,
    sun: closed,
  };
}

export function BusinessHoursEditor() {
  const { user, updateUser } = useAuth();
  const initial = useMemo(
    () => weekdayTemplate(user.businessHours),
    [user.businessHours]
  );
  const [open, setOpen] = useState(initial.open);
  const [close, setClose] = useState(initial.close);
  const [weekendOpen, setWeekendOpen] = useState(initial.weekendOpen);
  const [satOpen, setSatOpen] = useState(initial.satOpen);
  const [satClose, setSatClose] = useState(initial.satClose);
  const [saving, setSaving] = useState(false);
  const [savedHint, setSavedHint] = useState<string | null>(null);

  if (user.profileType !== "business" && user.role !== "pro") {
    return null;
  }

  const summary = formatBusinessHoursSummary(
    buildHours({ open, close, weekendOpen, satOpen, satClose })
  );

  const save = async () => {
    const businessHours = buildHours({
      open,
      close,
      weekendOpen,
      satOpen,
      satClose,
    });
    setSaving(true);
    setSavedHint(null);
    updateUser({ businessHours });
    if (isDataApiEnabled()) {
      const res = await apiUpdateUser({
        ...user,
        businessHours,
        avatar: sanitizeAvatarForApi(user.avatar),
      });
      if (!res.ok) {
        setSavedHint(res.error || "Nepavyko išsaugoti");
        setSaving(false);
        return;
      }
    }
    setSavedHint("Išsaugota — after-hours FAQ naudos šį laiką.");
    setSaving(false);
  };

  return (
    <div
      className="mt-3 rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-surface-muted)] p-3"
      data-business-hours-editor="1"
    >
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--vauto-text-main)]">
        <Clock className="h-3.5 w-3.5 text-[var(--ds-brand)]" aria-hidden />
        Darbo laikas (Europe/Vilnius)
      </p>
      <p className="mb-2 text-[11px] leading-snug text-[var(--vauto-text-muted)]">
        Ne darbo metu pirkėjams automatiškai siunčiamas trumpas FAQ atsakymas.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-[10px] font-semibold uppercase text-[var(--vauto-text-muted)]">
            I–V nuo
          </span>
          <input
            type="time"
            value={open}
            onChange={(e) => setOpen(e.target.value)}
            className="w-full rounded-lg border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] px-2 py-1.5 text-xs text-[var(--vauto-text-main)]"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-semibold uppercase text-[var(--vauto-text-muted)]">
            I–V iki
          </span>
          <input
            type="time"
            value={close}
            onChange={(e) => setClose(e.target.value)}
            className="w-full rounded-lg border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] px-2 py-1.5 text-xs text-[var(--vauto-text-main)]"
          />
        </label>
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs text-[var(--vauto-text-main)]">
        <input
          type="checkbox"
          checked={weekendOpen}
          onChange={(e) => setWeekendOpen(e.target.checked)}
          className="accent-[var(--ds-brand)]"
        />
        Šeštadieniais dirbame
      </label>
      {weekendOpen ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase text-[var(--vauto-text-muted)]">
              VI nuo
            </span>
            <input
              type="time"
              value={satOpen}
              onChange={(e) => setSatOpen(e.target.value)}
              className="w-full rounded-lg border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] px-2 py-1.5 text-xs text-[var(--vauto-text-main)]"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase text-[var(--vauto-text-muted)]">
              VI iki
            </span>
            <input
              type="time"
              value={satClose}
              onChange={(e) => setSatClose(e.target.value)}
              className="w-full rounded-lg border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] px-2 py-1.5 text-xs text-[var(--vauto-text-main)]"
            />
          </label>
        </div>
      ) : null}
      <p className="mt-2 text-[11px] text-[var(--vauto-text-muted)]">{summary}</p>
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[var(--ds-brand)] px-3 py-1.5 text-[11px] font-bold text-[var(--ds-brand-contrast)] disabled:opacity-60"
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : null}
        Išsaugoti darbo laiką
      </button>
      {savedHint ? (
        <p className="mt-1.5 text-[11px] font-medium text-emerald-700">
          {savedHint}
        </p>
      ) : null}
    </div>
  );
}
