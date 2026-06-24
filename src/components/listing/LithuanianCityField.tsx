"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveCitySelectValue } from "@/lib/listing-form-validation";

interface LithuanianCityFieldProps {
  location: string;
  cityOptions: readonly string[];
  onLocationChange: (city: string) => void;
  selectClassName?: string;
  inputClassName?: string;
  placeholder?: string;
}

export function LithuanianCityField({
  location,
  cityOptions,
  onLocationChange,
  selectClassName = "w-full max-w-xs border-0 border-b border-[#cfd8dc] bg-transparent py-2 text-sm outline-none focus:border-[#43a047]",
  inputClassName = "mt-2 w-full border-0 border-b border-[#cfd8dc] bg-transparent py-2 text-sm outline-none focus:border-[#43a047]",
  placeholder = "Įrašykite kaimą ar gyvenvietę…",
}: LithuanianCityFieldProps) {
  const resolved = useMemo(
    () => resolveCitySelectValue(location, cityOptions),
    [location, cityOptions]
  );
  const [customCity, setCustomCity] = useState(resolved.customCity);

  useEffect(() => {
    setCustomCity(resolved.customCity);
  }, [resolved.customCity]);

  const showCustom = resolved.selectValue === "Kita";

  return (
    <div>
      <select
        value={resolved.selectValue}
        onChange={(e) => {
          const next = e.target.value;
          if (next === "Kita") {
            onLocationChange(customCity.trim() || "");
            return;
          }
          onLocationChange(next);
        }}
        className={selectClassName}
      >
        <option value="">Pasirinkite</option>
        {cityOptions.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {showCustom && (
        <input
          type="text"
          value={customCity}
          onChange={(e) => {
            const v = e.target.value;
            setCustomCity(v);
            onLocationChange(v.trim());
          }}
          placeholder={placeholder}
          className={inputClassName}
          autoFocus
        />
      )}
    </div>
  );
}
