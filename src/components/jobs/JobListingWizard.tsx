"use client";

import { ChevronLeft, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import type { AiExtractedListing } from "@/lib/types";
import {
  AD_LANGUAGES,
  AD_VALIDITY_OPTIONS,
  BENEFIT_CATEGORIES,
  buildSalaryLabel,
  EDUCATION_LEVELS,
  EMPLOYMENT_TYPES_FULL,
  EXPERIENCE_AREAS,
  EXPERIENCE_YEARS,
  JOB_CITIES,
  JOB_GROUPS,
  JOB_LOCATION_TYPES,
  LANGUAGE_LEVELS,
  LANGUAGE_OPTIONS,
  SALARY_DISPLAY_TYPES,
  SALARY_GROSS_NET,
  SALARY_PERIODS,
} from "@/lib/job-catalog";
import { JOB_TYPE_OFFER, JOB_TYPE_SEEK } from "@/lib/jobs";
import { clearJobListingDraft, saveJobListingDraft } from "@/lib/listing-draft-storage";
import { LithuanianCityField } from "@/components/listing/LithuanianCityField";
import { isPlaceholderCity } from "@/lib/city-resolve";

const ACCENT = "#1f4b99";
const TOTAL_STEPS = 6;

const STEP_TITLES = [
  "Kontaktai ir pareigos",
  "Darbo vieta",
  "Aprašymas",
  "Įmonė siūlo",
  "Atlyginimas",
  "Skelbti",
] as const;

interface JobListingWizardProps {
  draft: AiExtractedListing;
  manualFallback?: boolean;
  onUpdate: (patch: Partial<AiExtractedListing>) => void;
  onAttributeChange: (key: string, value: string | string[]) => void;
  onCancel: () => void;
  onPublish: () => void;
  onToast?: (message: string, type?: "success" | "error" | "info") => void;
}

function attr(attrs: Record<string, string | string[] | undefined>, key: string): string {
  const v = attrs[key];
  return Array.isArray(v) ? v.join(", ") : String(v ?? "");
}

function attrArray(attrs: Record<string, string | string[] | undefined>, key: string): string[] {
  const v = attrs[key];
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) return v.split("||").map((s) => s.trim());
  return [];
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-0 overflow-hidden rounded-lg border border-[#d9e2f1]">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`px-3 py-2 text-sm ${
            value === opt
              ? "bg-[#eaf1ff] font-semibold text-[#1f4b99] ring-1 ring-inset ring-[#1f4b99]"
              : "bg-white text-[#475569] hover:bg-[#f8fafc]"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export function JobListingWizard({
  draft,
  manualFallback,
  onUpdate,
  onAttributeChange,
  onCancel,
  onPublish,
  onToast,
}: JobListingWizardProps) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [openBenefit, setOpenBenefit] = useState<string | null>("Darbo ir laisvalaikio balansas");
  const attrs = useMemo(() => draft.attributes ?? {}, [draft.attributes]);
  const benefits = attrArray(attrs, "benefits");
  const languages = attrArray(attrs, "languages");
  const jobMode = attr(attrs, "jobType") || JOB_TYPE_OFFER;
  const isJobSeeker = jobMode === JOB_TYPE_SEEK;

  const toggleLanguage = useCallback(
    (lang: string) => {
      const next = languages.includes(lang)
        ? languages.filter((l) => l !== lang)
        : [...languages, lang];
      onAttributeChange("languages", next);
    },
    [languages, onAttributeChange]
  );

  const toggleBenefit = useCallback(
    (item: string) => {
      const next = benefits.includes(item)
        ? benefits.filter((b) => b !== item)
        : [...benefits, item];
      onAttributeChange("benefits", next);
    },
    [benefits, onAttributeChange]
  );

  const syncTitle = () => {
    const title = attr(attrs, "jobTitle") || draft.title;
    if (title) onUpdate({ title, category: "jobs" });
  };

  const can1 = isJobSeeker
    ? Boolean(attr(attrs, "cvEmail") && attr(attrs, "experienceArea"))
    : Boolean(attr(attrs, "cvEmail") && (attr(attrs, "jobTitle") || draft.title));
  const can2 = Boolean(attr(attrs, "locationType") && draft.location);
  const can3 = isJobSeeker
    ? Boolean((draft.description ?? "").trim().length > 10)
    : Boolean(
        attr(attrs, "experienceArea") &&
          attr(attrs, "jobGroup") &&
          attr(attrs, "workNature")
      );
  const can5 = Boolean(attr(attrs, "salaryFrom") || attr(attrs, "salaryFixed"));
  const can6 = termsAccepted;

  const canNext = [false, can1, can2, can3, true, can5, can6][step];

  const handlePublish = () => {
    if (isPlaceholderCity(draft.location) || draft.location.trim().length < 2) {
      onToast?.("Klaida: Pasirinkite miestą arba įrašykite gyvenvietę.", "error");
      return;
    }
    if (!termsAccepted) {
      onToast?.("Klaida: Sutikite su portalo taisyklėmis.", "error");
      return;
    }
    const salaryLabel = buildSalaryLabel(attrs);
    if (salaryLabel) {
      const num = parseFloat(attr(attrs, "salaryFixed") || attr(attrs, "salaryFrom") || "0");
      onUpdate({
        price: num || draft.price,
        priceLabel: salaryLabel,
        category: "jobs",
        attributes: {
          ...attrs,
          jobType: isJobSeeker ? JOB_TYPE_SEEK : JOB_TYPE_OFFER,
          salaryType: attr(attrs, "salaryPeriod") || "€/mėn.",
        },
      });
    } else if (isJobSeeker) {
      onUpdate({
        category: "jobs",
        attributes: {
          ...attrs,
          jobType: JOB_TYPE_SEEK,
        },
      });
    }
    syncTitle();
    clearJobListingDraft();
    onPublish();
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="listing-wizard-overlay chameleon-wizard-shell bg-[var(--portal-wizard-bg,#f5f7fb)]">
        <div className="mx-auto w-full max-w-2xl bg-[var(--portal-wizard-surface,#fff)] shadow-sm">
        <div className="border-b border-[#d9e2f1] bg-[#eaf1ff] px-4 py-2 text-center text-xs font-bold uppercase text-[#1f4b99]">
          Nr.1 lankomiausias darbo portalas
        </div>
        <div className="flex items-center justify-between border-b border-[#d9e2f1] px-4 py-3">
          <div>
            <p className="text-xs text-[#64748b]">
              Žingsnis {step}/{TOTAL_STEPS}
            </p>
            <h1 className="text-lg font-bold text-[#172033]">Darbo skelbimas</h1>
            <p className="text-sm text-[#475569]">{STEP_TITLES[step - 1]}</p>
          </div>
          <button type="button" onClick={onCancel} className="rounded p-1 text-[#64748b] hover:bg-[#f1f5f9]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 py-5">
          <div className="mb-4 rounded-xl border border-[#c8d8f4] bg-[#f8fbff] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#1f4b99]">
              Skelbimo tipas (CVBankas)
            </p>
            <Segmented
              options={[JOB_TYPE_OFFER, JOB_TYPE_SEEK]}
              value={jobMode}
              onChange={(v) => onAttributeChange("jobType", v)}
            />
            <p className="mt-2 text-[10px] leading-relaxed text-[#64748b]">
              {isJobSeeker
                ? "Vartotojo srautas — ieškote darbo ir siūlote savo CV."
                : "Verslo srautas — darbdavys skelbia darbo pasiūlymą."}
            </p>
          </div>

          {manualFallback && step === 1 && (
            <p className="mb-4 rounded-lg border border-[#c8d8f4] bg-[#eaf1ff] px-3 py-2 text-xs text-[#1f4b99]">
              AI nepavyko pilnai atpažinti — užpildykite darbo skelbimą ranka.
            </p>
          )}

          {step === 1 && isJobSeeker && (
            <>
              <label className="mb-1 block text-sm font-medium text-[#334155]">
                CV / profilio nuoroda arba el. paštas *
              </label>
              <input
                type="text"
                value={attr(attrs, "cvEmail") || user.email || ""}
                onChange={(e) => onAttributeChange("cvEmail", e.target.value)}
                placeholder="cv@email.lt arba LinkedIn nuoroda"
                className="mb-4 w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
              />
              <label className="mb-1 block text-sm font-medium text-[#334155]">
                Pageidaujama pareigų sritis *
              </label>
              <select
                value={attr(attrs, "experienceArea")}
                onChange={(e) => onAttributeChange("experienceArea", e.target.value)}
                className="mb-4 w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
              >
                <option value="">Pasirinkite</option>
                {EXPERIENCE_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <label className="mb-1 block text-sm font-medium text-[#334155]">
                Tikslinis atlyginimas (nuo), €/mėn.
              </label>
              <input
                type="number"
                value={attr(attrs, "salaryFrom")}
                onChange={(e) => onAttributeChange("salaryFrom", e.target.value)}
                className="mb-4 w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
              />
              <p className="mb-2 text-sm font-medium text-[#334155]">Darbo vieta</p>
              <Segmented
                options={["Nuotolinis", "Ofise", "Hibridinis"]}
                value={attr(attrs, "locationType")}
                onChange={(v) => onAttributeChange("locationType", v)}
              />
              <label className="mb-1 mt-4 block text-sm font-medium text-[#334155]">
                Išsilavinimas
              </label>
              <select
                value={attr(attrs, "education")}
                onChange={(e) => onAttributeChange("education", e.target.value)}
                className="mb-4 w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
              >
                <option value="">Pasirinkite</option>
                {EDUCATION_LEVELS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
              <p className="mb-2 text-sm font-medium text-[#334155]">Kalbos</p>
              <div className="mb-3 flex flex-wrap gap-2">
                {LANGUAGE_OPTIONS.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => toggleLanguage(lang)}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      languages.includes(lang)
                        ? "border-[#1f4b99] bg-[#1f4b99] text-white"
                        : "border-[#d9e2f1] text-[#475569]"
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
              <label className="mb-1 block text-sm font-medium text-[#334155]">Kalbos lygis</label>
              <select
                value={attr(attrs, "languageLevel")}
                onChange={(e) => onAttributeChange("languageLevel", e.target.value)}
                className="mb-4 w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
              >
                <option value="">—</option>
                {LANGUAGE_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <label className="mb-1 block text-sm font-medium text-[#334155]">
                CV failo nuoroda (PDF / Word)
              </label>
              <input
                type="url"
                value={attr(attrs, "cvFile")}
                onChange={(e) => onAttributeChange("cvFile", e.target.value)}
                placeholder="https://…"
                className="w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
              />
            </>
          )}

          {step === 1 && !isJobSeeker && (
            <>
              <label className="mb-1 block text-sm font-medium text-[#334155]">
                CV siųsti el. pašto adresu
              </label>
              <input
                type="email"
                value={attr(attrs, "cvEmail") || user.email || ""}
                onChange={(e) => onAttributeChange("cvEmail", e.target.value)}
                className="mb-4 w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
              />
              <label className="mb-1 block text-sm font-medium text-[#334155]">
                Pareigų pavadinimas *
              </label>
              <input
                type="text"
                value={attr(attrs, "jobTitle") || draft.title}
                onChange={(e) => {
                  onAttributeChange("jobTitle", e.target.value);
                  onUpdate({ title: e.target.value });
                }}
                className="mb-4 w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
              />
              <p className="mb-2 text-sm font-medium text-[#334155]">Darbo laikas</p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={attr(attrs, "workTimeFull") === "true"}
                    onChange={(e) => onAttributeChange("workTimeFull", e.target.checked ? "true" : "false")}
                    className="accent-[#1f4b99]"
                  />
                  Visa darbo diena
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={attr(attrs, "workTimePart") === "true"}
                    onChange={(e) => onAttributeChange("workTimePart", e.target.checked ? "true" : "false")}
                    className="accent-[#1f4b99]"
                  />
                  Ne visa darbo diena
                </label>
              </div>
              <label className="mb-1 mt-4 block text-sm font-medium text-[#334155]">
                Įmonės juridinis kodas
              </label>
              <input
                type="text"
                value={attr(attrs, "companyLegalCode")}
                onChange={(e) => onAttributeChange("companyLegalCode", e.target.value)}
                placeholder="123456789"
                className="mb-4 w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
              />
              <label className="mb-1 block text-sm font-medium text-[#334155]">
                Įmonės logotipo nuoroda
              </label>
              <input
                type="url"
                value={attr(attrs, "companyLogo")}
                onChange={(e) => onAttributeChange("companyLogo", e.target.value)}
                placeholder="https://…"
                className="w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
              />
            </>
          )}

          {step === 2 && (
            <>
              <p className="mb-2 text-sm font-medium text-[#334155]">Darbo vieta</p>
              <Segmented
                options={JOB_LOCATION_TYPES}
                value={attr(attrs, "locationType") || "Lietuva"}
                onChange={(v) => onAttributeChange("locationType", v)}
              />
              <div className="mt-4">
                <label className="mb-1 block text-sm text-[#475569]">Miestas *</label>
                <LithuanianCityField
                  location={draft.location}
                  cityOptions={JOB_CITIES}
                  onLocationChange={(city) => onUpdate({ location: city })}
                  selectClassName="mb-3 w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
                  inputClassName="mb-3 w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
                />
              </div>
              <label className="mb-1 block text-sm text-[#475569]">Darbo vietos adresas</label>
              <input
                type="text"
                value={attr(attrs, "address")}
                onChange={(e) => onAttributeChange("address", e.target.value)}
                placeholder="Įveskite adresą"
                className="mb-3 w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
              />
              <label className="mb-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={attr(attrs, "hideAddress") === "true"}
                  onChange={(e) => onAttributeChange("hideAddress", e.target.checked ? "true" : "false")}
                />
                Nerodyti adreso skelbime
              </label>
              <label className="mb-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={attr(attrs, "acceptsUkrainians") === "true"}
                  onChange={(e) => onAttributeChange("acceptsUkrainians", e.target.checked ? "true" : "false")}
                />
                Priimame ukrainiečius 🇺🇦
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={attr(attrs, "openToDisability") === "true"}
                  onChange={(e) => onAttributeChange("openToDisability", e.target.checked ? "true" : "false")}
                />
                Atvira žmonėms su negalia
              </label>
            </>
          )}

          {step === 3 && isJobSeeker && (
            <>
              <label className="mb-1 block text-sm font-medium text-[#334155]">
                Trumpas CV aprašymas / įgūdžiai *
              </label>
              <textarea
                rows={5}
                value={draft.description ?? ""}
                onChange={(e) => onUpdate({ description: e.target.value })}
                className="mb-3 w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
              />
            </>
          )}

          {step === 3 && !isJobSeeker && (
            <>
              <label className="mb-1 block text-sm text-[#475569]">Ieškomo darbuotojo sritis *</label>
              <select
                value={attr(attrs, "experienceArea")}
                onChange={(e) => onAttributeChange("experienceArea", e.target.value)}
                className="mb-4 w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
              >
                <option value="">Pasirinkite</option>
                {EXPERIENCE_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <p className="mb-2 text-sm font-medium text-[#334155]">Skelbimo grupė *</p>
              <Segmented
                options={JOB_GROUPS}
                value={attr(attrs, "jobGroup")}
                onChange={(v) => onAttributeChange("jobGroup", v)}
              />
              <label className="mb-1 mt-4 block text-sm font-medium text-[#334155]">Darbo pobūdis *</label>
              <textarea
                rows={3}
                value={attr(attrs, "workNature")}
                onChange={(e) => onAttributeChange("workNature", e.target.value)}
                className="mb-3 w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
              />
              <label className="mb-1 block text-sm font-medium text-[#334155]">Reikalavimai darbuotojui</label>
              <textarea
                rows={3}
                value={attr(attrs, "requirements")}
                onChange={(e) => onAttributeChange("requirements", e.target.value)}
                className="mb-3 w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
              />
              <label className="mb-1 block text-sm font-medium text-[#334155]">Įmonė siūlo</label>
              <textarea
                rows={3}
                value={attr(attrs, "companyOffers")}
                onChange={(e) => onAttributeChange("companyOffers", e.target.value)}
                placeholder="Atlyginimas, bonusai, karjeros galimybės…"
                className="mb-3 w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
              />
              <label className="mb-1 block text-sm font-medium text-[#334155]">
                Kompetencijos / programos
              </label>
              <input
                type="text"
                value={attr(attrs, "competencies")}
                onChange={(e) => onAttributeChange("competencies", e.target.value)}
                placeholder="Excel, SAP, AutoCAD…"
                className="mb-3 w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
              />
              <p className="mb-2 text-sm font-medium text-[#334155]">Etatas</p>
              <Segmented
                options={EMPLOYMENT_TYPES_FULL}
                value={attr(attrs, "employmentType")}
                onChange={(v) => onAttributeChange("employmentType", v)}
              />
              <label className="mb-1 mt-4 block text-sm font-medium text-[#334155]">
                Reikalaujama patirtis
              </label>
              <select
                value={attr(attrs, "experienceRequired")}
                onChange={(e) => onAttributeChange("experienceRequired", e.target.value)}
                className="mb-3 w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
              >
                <option value="">—</option>
                {EXPERIENCE_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <label className="mb-1 block text-sm text-[#475569]">Darbdavys (rodomas skelbime)</label>
              <input
                type="text"
                value={attr(attrs, "employerName")}
                onChange={(e) => onAttributeChange("employerName", e.target.value)}
                placeholder="UAB Pavadinimas"
                className="w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
              />
            </>
          )}

          {step === 4 && !isJobSeeker && (
            <div className="space-y-2">
              <p className="mb-2 font-semibold text-[#172033]">Įmonė siūlo</p>
              {Object.entries(BENEFIT_CATEGORIES).map(([cat, items]) => (
                <div key={cat} className="rounded-lg border border-[#e8ecf3] bg-[#fafbfc]">
                  <button
                    type="button"
                    onClick={() => setOpenBenefit(openBenefit === cat ? null : cat)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-[#334155]"
                  >
                    {cat}
                    <span className="text-[#1f4b99]">{openBenefit === cat ? "▲" : "▼"}</span>
                  </button>
                  {openBenefit === cat && (
                    <div className="space-y-2 border-t border-[#e8ecf3] px-4 py-3">
                      {items.map((item) => (
                        <label key={item} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={benefits.includes(item)}
                            onChange={() => toggleBenefit(item)}
                            className="accent-[#1f4b99]"
                          />
                          {item}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {step === 5 && (
            <>
              <p className="mb-2 text-sm font-medium text-[#334155]">Atlyginimo atvaizdavimas</p>
              <Segmented
                options={SALARY_DISPLAY_TYPES}
                value={attr(attrs, "salaryDisplay") || "Į rankas"}
                onChange={(v) => onAttributeChange("salaryDisplay", v)}
              />
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm text-[#475569]">Nuo</label>
                  <input
                    type="number"
                    value={attr(attrs, "salaryFrom")}
                    onChange={(e) => onAttributeChange("salaryFrom", e.target.value)}
                    className="w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-[#475569]">iki</label>
                  <input
                    type="number"
                    value={attr(attrs, "salaryTo")}
                    onChange={(e) => onAttributeChange("salaryTo", e.target.value)}
                    className="w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
                  />
                </div>
              </div>
              <label className="mb-3 mt-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={attr(attrs, "salaryFixedMode") === "true"}
                  onChange={(e) => onAttributeChange("salaryFixedMode", e.target.checked ? "true" : "false")}
                />
                Nurodyti fiksuotą atlyginimą
              </label>
              {attr(attrs, "salaryFixedMode") === "true" && (
                <input
                  type="number"
                  value={attr(attrs, "salaryFixed")}
                  onChange={(e) => onAttributeChange("salaryFixed", e.target.value)}
                  className="mb-3 w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
                />
              )}
              <Segmented
                options={SALARY_PERIODS}
                value={attr(attrs, "salaryPeriod") || "€/mėn."}
                onChange={(v) => onAttributeChange("salaryPeriod", v)}
              />
              <p className="mb-2 mt-4 text-sm font-medium text-[#334155]">Bruto / Neto</p>
              <Segmented
                options={SALARY_GROSS_NET}
                value={attr(attrs, "salaryGrossNet") || "Bruto"}
                onChange={(v) => onAttributeChange("salaryGrossNet", v)}
              />
            </>
          )}

          {step === 6 && (
            <>
              <label className="mb-1 block text-sm text-[#475569]">Skelbimas galios</label>
              <select
                value={attr(attrs, "adValidity") || "30 dienų"}
                onChange={(e) => onAttributeChange("adValidity", e.target.value)}
                className="mb-4 w-full rounded border border-[#d9e2f1] px-3 py-2.5 text-sm"
              >
                {AD_VALIDITY_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <p className="mb-2 text-sm font-medium text-[#334155]">Skelbimo kalba</p>
              <Segmented
                options={AD_LANGUAGES}
                value={attr(attrs, "adLanguage") || "LT"}
                onChange={(v) => onAttributeChange("adLanguage", v)}
              />
              <label className="mb-6 mt-4 flex items-start gap-2 text-sm text-[#475569]">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 accent-[#1f4b99]"
                />
                Sutinku su naudojimosi taisyklėmis
              </label>
              <div className="rounded-lg border border-[#d9e2f1] bg-[#f8fafc] p-4 text-sm">
                <p className="font-bold text-[#e53935]">
                  {attr(attrs, "jobTitle") || draft.title}
                  {attr(attrs, "employerName") ? ` (darbdavys - ${attr(attrs, "employerName")})` : ""}
                </p>
                <p className="mt-1 text-[#64748b]">{draft.location}</p>
                <p className="mt-1 font-medium text-[#1f4b99]">
                  {buildSalaryLabel(attrs) || "Atlyginimas derinamas"}
                </p>
              </div>
            </>
          )}

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-[#e8ecf3] pt-4">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="inline-flex items-center gap-1 text-sm text-[#64748b]"
              >
                <ChevronLeft className="h-4 w-4" />
                Grįžti
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  saveJobListingDraft({ ...draft, attributes: attrs }, null);
                  onToast?.("Ruošinys išsaugotas.", "success");
                }}
                className="rounded-lg border border-[#1f4b99] px-4 py-2 text-sm font-medium text-[#1f4b99]"
              >
                Išsaugoti ruošinį
              </button>
              <button
                type="button"
                disabled={!canNext && step < TOTAL_STEPS}
                onClick={() => {
                  if (step === 3) {
                    const desc = [
                      attr(attrs, "workNature"),
                      attr(attrs, "requirements") && `Reikalavimai: ${attr(attrs, "requirements")}`,
                      attr(attrs, "companyOffers") && `Siūlome: ${attr(attrs, "companyOffers")}`,
                    ]
                      .filter(Boolean)
                      .join("\n\n");
                    if (desc) onUpdate({ description: desc });
                  }
                  if (step < TOTAL_STEPS) setStep((s) => s + 1);
                  else handlePublish();
                }}
                className="rounded-lg px-6 py-2.5 text-sm font-bold text-white disabled:opacity-40"
                style={{ backgroundColor: ACCENT }}
              >
                {step >= TOTAL_STEPS ? "Skelbti" : "Toliau"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
