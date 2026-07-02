"use client";

import { ScanFace } from "lucide-react";

interface MagicMirrorPanelProps {
  chestCm: string;
  waistCm: string;
  hipsCm: string;
  lengthCm: string;
  onChange: (key: string, value: string) => void;
}

export function MagicMirrorPanel({
  chestCm,
  waistCm,
  hipsCm,
  lengthCm,
  onChange,
}: MagicMirrorPanelProps) {
  const fields = [
    { key: "chestCm", label: "Krūtinė (cm)", value: chestCm },
    { key: "waistCm", label: "Liemuo (cm)", value: waistCm },
    { key: "hipsCm", label: "Klubai (cm)", value: hipsCm },
    { key: "lengthCm", label: "Ilgis (cm)", value: lengthCm },
  ];

  return (
    <div className="mb-6 rounded-3xl border border-border bg-card p-4 text-foreground">
      <div className="mb-3 flex items-center gap-2">
        <ScanFace className="h-5 w-5 text-primary" />
        <div>
          <p className="text-sm font-semibold text-foreground">Magic Mirror</p>
          <p className="text-[11px] text-muted-foreground">
            Virtuali kabina — AI palygins matmenis su pirkėjos profiliu pokalbyje
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {fields.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
              {f.label}
            </span>
            <input
              type="number"
              min={0}
              value={f.value}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
