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
    <div className="mb-6 rounded-3xl border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <ScanFace className="h-5 w-5 text-violet-600" />
        <div>
          <p className="text-sm font-semibold text-slate-900">Magic Mirror</p>
          <p className="text-[11px] text-slate-500">
            Virtuali kabina — AI palygins matmenis su pirkėjos profiliu pokalbyje
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {fields.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-400">
              {f.label}
            </span>
            <input
              type="number"
              min={0}
              value={f.value}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="w-full rounded-xl border border-violet-100 bg-white px-2.5 py-2 text-sm outline-none focus:border-violet-400"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
