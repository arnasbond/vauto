"use client";

import { useCallback, useState } from "react";
import { Bot, Camera, Link2, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

export const SMART_ONBOARDING_SLIDES = [
  {
    icon: Sparkles,
    title: "Sveiki atvykę į VAUTO",
    body: "Čia automobilių, nekilnojamojo turto, paslaugų, mados ir įvairūs kiti skelbimai gyvena vienoje išmanioje vietoje. Nesvarbu, ar parduodi, ar ieškai – viską padarysime kartu, be jokio streso.",
  },
  {
    icon: Link2,
    title: "Portalų importas ir stebėjimas",
    body: "Sujunk profilio nuorodą iš kito portalo — VAUTO importuos skelbimus ir stebės atnaujinimus. Tai importas ir monitoringas, ne automatinis publikavimas visur.",
  },
  {
    icon: Bot,
    title: "AI asistentas, kuris niekada nemiega",
    body: "Kai pirkėjas parašo naktį ar dera dėl kainos, tavo AI dvynys atsako už tave – mandagiai, šiltai ir pagal tavo taisykles. Tu ilsėsies, o derybos vyks 24 valandas per parą.",
  },
  {
    icon: Camera,
    title: "Nufotografuok – o kita palik mums",
    body: "Įkelk daikto, automobilio ar drabužio nuotrauką, ir AI pats atpažins, ką matai, parašys aprašymą bei pasiūlys kainą. Jokių ilgų formų – tik viena nuotrauka.",
  },
  {
    icon: ShieldCheck,
    title: "Saugu, paprasta ir be rūpesčių",
    body: "Escrow mokėjimai per Stripe, siuntų lipdukai per carrier adapterį ir patikimumo įvertinimai — kai atitinkami serverio tiekėjai. VAUTO prisitaiko tiek namų, tiek verslo poreikiams.",
  },
] as const;

interface SmartOnboardingCarouselProps {
  className?: string;
}

export function SmartOnboardingCarousel({ className }: SmartOnboardingCarouselProps) {
  const [index, setIndex] = useState(0);
  const slide = SMART_ONBOARDING_SLIDES[index];
  const Icon = slide.icon;

  const goTo = useCallback((next: number) => {
    setIndex((next + SMART_ONBOARDING_SLIDES.length) % SMART_ONBOARDING_SLIDES.length);
  }, []);

  return (
    <div className={cn("w-full", className)}>
      <div className="vauto-onboarding-card rounded-3xl p-6 text-left">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <Icon className="h-7 w-7" aria-hidden />
        </span>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {index + 1} / {SMART_ONBOARDING_SLIDES.length}
        </p>
        <h2 className="mt-2 text-lg font-semibold leading-snug text-foreground">
          {slide.title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{slide.body}</p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex gap-1.5" role="tablist" aria-label="Onboarding skaidrės">
          {SMART_ONBOARDING_SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Skaidrė ${i + 1}`}
              onClick={() => setIndex(i)}
              className={cn(
                "h-2 rounded-full transition-all duration-200",
                i === index
                  ? "w-6 bg-primary"
                  : "w-2 bg-border hover:bg-primary/30"
              )}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          className="text-xs font-semibold text-primary transition-opacity hover:opacity-80"
        >
          Toliau →
        </button>
      </div>
    </div>
  );
}
