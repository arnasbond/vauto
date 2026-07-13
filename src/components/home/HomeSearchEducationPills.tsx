"use client";

const EDUCATION_PILLS = [
  "iPhone 15 nebrangiai",
  "Sofa iki 400€ Vilniuje",
  "Citroen generatorius",
] as const;

export function HomeSearchEducationPills({
  onSelect,
}: {
  onSelect: (query: string) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-2 md:justify-start">
      {EDUCATION_PILLS.map((pill) => (
        <button
          key={pill}
          type="button"
          onClick={() => onSelect(pill)}
          className="rounded-full bg-slate-100 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-200 hover:text-slate-800"
        >
          {pill}
        </button>
      ))}
    </div>
  );
}
