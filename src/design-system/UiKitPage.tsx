"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  Inbox,
  Plus,
  Settings,
  Sparkles,
  Star,
} from "lucide-react";
import {
  AiInsightCard,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  DropdownMenu,
  EmptyState,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Radio,
  SearchInput,
  SectionHeader,
  Select,
  Skeleton,
  StatCard,
  Switch,
  Tabs,
  Textarea,
  Tooltip,
} from "@/design-system";

const COLOR_SWATCHES: { name: string; varName: string }[] = [
  { name: "brand", varName: "--ds-brand" },
  { name: "text-primary", varName: "--ds-text-primary" },
  { name: "text-secondary", varName: "--ds-text-secondary" },
  { name: "text-muted", varName: "--ds-text-muted" },
  { name: "surface-page", varName: "--ds-surface-page" },
  { name: "surface-card", varName: "--ds-surface-card" },
  { name: "surface-elevated", varName: "--ds-surface-elevated" },
  { name: "surface-muted", varName: "--ds-surface-muted" },
  { name: "border-subtle", varName: "--ds-border-subtle" },
  { name: "border-strong", varName: "--ds-border-strong" },
  { name: "success", varName: "--ds-success" },
  { name: "warning", varName: "--ds-warning" },
  { name: "danger", varName: "--ds-danger" },
  { name: "info", varName: "--ds-info" },
  { name: "ai", varName: "--ds-ai" },
  { name: "premium", varName: "--ds-premium" },
  { name: "premium-gold", varName: "--ds-premium-gold" },
];

export function UiKitPage() {
  const [tab, setTab] = useState("buttons");
  const [modalOpen, setModalOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const viewportHint = useMemo(
    () =>
      typeof window !== "undefined" ? `${window.innerWidth}px` : "—",
    []
  );

  return (
    <div
      className={dark ? "ds-theme-dark" : undefined}
      style={{
        minHeight: "100dvh",
        background: "var(--ds-surface-page)",
        color: "var(--ds-text-primary)",
        fontFamily: "var(--ds-font-sans)",
      }}
    >
      <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-10">
        <PageHeader
          title="VAUTO Design System 2.0"
          description="Dev/admin UI Kit — tokenai ir primityvai. Esami produkto puslapiai dar nemigruoti."
          actions={
            <>
              <Switch
                label={dark ? "Dark preview" : "Light preview"}
                checked={dark}
                onChange={(e) => setDark(e.target.checked)}
              />
              <Badge tone="ai">AI indigo</Badge>
              <Badge tone="premium">Premium</Badge>
            </>
          }
        />

        <p className="ds-caption mt-3">
          Viewport hint: {viewportHint} · target mobile 390 / desktop 1440 ·
          Tab navigacija + focus-visible
        </p>

        <div className="mt-6">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: "tokens", label: "Tokens" },
              { id: "buttons", label: "Buttons" },
              { id: "forms", label: "Forms" },
              { id: "feedback", label: "Feedback" },
              { id: "layout", label: "Layout" },
            ]}
          />
        </div>

        {tab === "tokens" ? (
          <section className="mt-8 space-y-8">
            <SectionHeader
              title="Spalvos"
              description="Semantiniai --ds-* tokenai (light + dark-ready)."
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {COLOR_SWATCHES.map((s) => (
                <div
                  key={s.name}
                  className="overflow-hidden rounded-[var(--ds-radius-card)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] shadow-[var(--ds-shadow-xs)]"
                >
                  <div
                    className="h-16"
                    style={{ background: `var(${s.varName})` }}
                  />
                  <div className="p-2">
                    <p className="ds-label">{s.name}</p>
                    <p className="ds-caption font-mono">{s.varName}</p>
                  </div>
                </div>
              ))}
            </div>

            <SectionHeader title="Tipografija" />
            <Card>
              <p className="ds-display">Display 52–64</p>
              <p className="ds-h1 mt-4">H1 40–48</p>
              <p className="ds-h2 mt-3">H2 30–36</p>
              <p className="ds-h3 mt-3">H3 22–26</p>
              <p className="ds-body-lg mt-3">Body large 18 — Geist</p>
              <p className="ds-body mt-2">Body 16 — pagrindinis tekstas</p>
              <p className="ds-body-sm mt-2">Body sm 14 — antrinis</p>
              <p className="ds-caption mt-2">Caption 12</p>
              <p className="ds-label mt-2">Label</p>
            </Card>

            <SectionHeader title="Spacing · Radius · Shadow · Motion" />
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <p className="ds-label mb-3">4px spacing skalė</p>
                <div className="flex flex-wrap items-end gap-2">
                  {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                    <div key={n} className="text-center">
                      <div
                        className="rounded-sm bg-[var(--ds-brand)]"
                        style={{
                          width: `var(--ds-space-${n})`,
                          height: `var(--ds-space-${n})`,
                        }}
                      />
                      <p className="ds-caption mt-1">{n}</p>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <p className="ds-label mb-3">Shadows (be stipraus border)</p>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ["xs", "var(--ds-shadow-xs)"],
                      ["sm", "var(--ds-shadow-sm)"],
                      ["md", "var(--ds-shadow-md)"],
                      ["lg", "var(--ds-shadow-lg)"],
                    ] as const
                  ).map(([name, sh]) => (
                    <div
                      key={name}
                      className="rounded-[var(--ds-radius-card)] bg-[var(--ds-surface-card)] p-4"
                      style={{ boxShadow: sh }}
                    >
                      <p className="ds-label">shadow-{name}</p>
                    </div>
                  ))}
                </div>
                <p className="ds-caption mt-3">
                  Motion: fast 120 / normal 180 / slow 240 · reduced-motion → 0
                </p>
              </Card>
            </div>
          </section>
        ) : null}

        {tab === "buttons" ? (
          <section className="mt-8 space-y-6">
            <SectionHeader title="Button" description="Visos variantų ir dydžių būsenos." />
            <Card className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button>Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="tertiary">Tertiary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">Danger</Button>
                <Button variant="ai" leftIcon={<Sparkles className="h-4 w-4" />}>
                  AI
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
                <Button
                  loading={loadingDemo}
                  onClick={() => {
                    setLoadingDemo(true);
                    window.setTimeout(() => setLoadingDemo(false), 1200);
                  }}
                >
                  Loading
                </Button>
                <Button disabled>Disabled</Button>
                <Button iconOnly aria-label="Pridėti" leftIcon={<Plus className="h-4 w-4" />} />
              </div>
              <div className="flex flex-wrap gap-2">
                <IconButton label="Nustatymai">
                  <Settings className="h-4 w-4" />
                </IconButton>
                <IconButton label="AI" tone="ai">
                  <Sparkles className="h-4 w-4" />
                </IconButton>
                <IconButton label="Favorite" tone="brand">
                  <Star className="h-4 w-4" />
                </IconButton>
                <IconButton label="Alert" tone="danger">
                  <AlertCircle className="h-4 w-4" />
                </IconButton>
                <Tooltip content="Tooltip pavyzdys">
                  <Button variant="secondary" size="sm">
                    Hover / focus tooltip
                  </Button>
                </Tooltip>
                <DropdownMenu
                  label="Dropdown"
                  items={[
                    { id: "a", label: "Redaguoti" },
                    { id: "b", label: "Dalintis" },
                    { id: "c", label: "Ištrinti", danger: true },
                  ]}
                  onSelect={() => undefined}
                />
                <Button variant="secondary" onClick={() => setModalOpen(true)}>
                  Atidaryti modal
                </Button>
              </div>
            </Card>
          </section>
        ) : null}

        {tab === "forms" ? (
          <section className="mt-8 space-y-6">
            <SectionHeader title="Form controls" />
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="space-y-3">
                <Input label="Pavadinimas" placeholder="iPhone 16" />
                <Input label="Klaida" error="Privalomas laukas" defaultValue="" />
                <SearchInput placeholder="Ieškoti…" aria-label="Paieška" />
                <Textarea label="Aprašymas" placeholder="Trumpas tekstas" />
                <Select
                  label="Kategorija"
                  options={[
                    { value: "auto", label: "Transportas" },
                    { value: "tech", label: "Elektronika" },
                  ]}
                />
              </Card>
              <Card className="space-y-4">
                <Checkbox label="Sutinku su taisyklėmis" defaultChecked />
                <Radio name="ship" label="Pastomatas" defaultChecked />
                <Radio name="ship" label="Kurjeris" />
                <Switch label="Siųsti pranešimus" defaultChecked />
              </Card>
            </div>
          </section>
        ) : null}

        {tab === "feedback" ? (
          <section className="mt-8 space-y-6">
            <SectionHeader title="Badge · Alert · Skeleton · Empty" />
            <div className="flex flex-wrap gap-2">
              <Badge>Status</Badge>
              <Badge tone="ai">AI</Badge>
              <Badge tone="category">Kategorija</Badge>
              <Badge tone="risk-low">Risk low</Badge>
              <Badge tone="risk-medium">Risk medium</Badge>
              <Badge tone="risk-high">Risk high</Badge>
              <Badge tone="success">Success</Badge>
              <Badge tone="warning">Warning</Badge>
              <Badge tone="danger">Danger</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Alert tone="info" title="Info">
                Informacinis pranešimas.
              </Alert>
              <Alert tone="success" title="Success">
                Operacija pavyko.
              </Alert>
              <Alert tone="warning" title="Warning">
                Reikia peržiūros.
              </Alert>
              <Alert tone="danger" title="Danger">
                Klaida — patikrinkite duomenis.
              </Alert>
              <Alert tone="ai" title="AI">
                Modelio pasiūlymas.
              </Alert>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-24" rounded="card" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10 w-10" rounded="full" />
            </div>
            <EmptyState
              icon={<Inbox className="h-8 w-8" />}
              title="Nėra skelbimų"
              description="Kai sukursite pirmą skelbimą, jis atsiras čia."
              actionLabel="Sukurti skelbimą"
              onAction={() => undefined}
            />
          </section>
        ) : null}

        {tab === "layout" ? (
          <section className="mt-8 space-y-6">
            <SectionHeader title="Cards · Stats · AI insight" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Card>Default card</Card>
              <Card variant="interactive">Interactive card</Card>
              <Card variant="elevated">Elevated (shadow, soft border)</Card>
              <Card variant="muted">Muted</Card>
              <Card variant="ai">AI surface</Card>
              <Card variant="warning">Warning</Card>
              <Card variant="danger">Danger</Card>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Peržiūros" value="12 480" hint="+12% · up" trend="up" />
              <StatCard label="Žinutės" value="326" hint="-4% · down" trend="down" />
              <StatCard label="Konversija" value="3.2 %" hint="Stabilu" trend="flat" />
            </div>
            <AiInsightCard
              title="Kaina šiek tiek aukščiau rinkos"
              body="Panašūs skelbimai Vidurio Lietuvoje parduodami 5–8 % pigiau. Siūlau sumažinti iki 289 €."
              ctaLabel="Pritaikyti pasiūlymą"
              onCta={() => undefined}
            />
          </section>
        ) : null}
      </div>

      <Modal
        open={modalOpen}
        title="Modal / Dialog"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Atšaukti
            </Button>
            <Button onClick={() => setModalOpen(false)}>Patvirtinti</Button>
          </>
        }
      >
        Escape uždaro · focus-visible ant mygtukų · subtilus shadow be sunkaus border.
      </Modal>
    </div>
  );
}
