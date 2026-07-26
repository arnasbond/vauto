import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
} from "cursor/canvas";

const STRESS_RESULTS = [
  [
    "pordodu ratud r16",
    "Chaotic sell + sell-intent",
    "PASS",
    "Typo map → parduodu/ratus; deterministic sell",
  ],
  [
    "ieskau drbo",
    "Job-seeker create",
    "PASS",
    "drbo→darbo; create draft, not catalog search",
  ],
  [
    "продаю / ищу работу",
    "Mixed LT/EN/RU",
    "PASS",
    "RU sell/job tokens normalized",
  ],
  [
    "Shoe photo vs stogo remontas",
    "Vision↔text conflict",
    "PASS",
    "Hard stop + choice chips; no silent merge",
  ],
  [
    "ok / nu / 👍",
    "Ultra-short confirm",
    "PASS",
    "Confirm SM; excluded from browse-all",
  ],
  [
    "kaina sutarine geras stovys",
    "Slang sell note",
    "PASS",
    "Sell intent retained under slang",
  ],
];

export default function VautoLeadArchitectReport() {
  return (
    <Stack gap={20} style={{ padding: 20, maxWidth: 1100 }}>
      <Stack gap={6}>
        <H1>VAUTO Lead Architect Report</H1>
        <Text tone="secondary">
          Stress-hardened chaotic inputs · strategic assessment · Jul 2026
        </Text>
        <Row gap={8} wrap>
          <Pill tone="success" active>
            Stress suite green
          </Pill>
          <Pill tone="info" active>
            ChatGPT-parity attach
          </Pill>
          <Pill tone="neutral" active>
            Text-first marketplace
          </Pill>
        </Row>
      </Stack>

      <Callout tone="info" title="Executive verdict">
        VAUTO’s core bet — conversational create/search with vision fusion — is
        architecturally sound and already ahead of form-first Baltic classifieds.
        The next leap is operational: unify shared intent packages, async heavy
        AI work, and retrieval/logistics so the product scales without melting
        the request path.
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat value="6/6" label="Chaotic scenarios" tone="success" />
        <Stat value="P0×2" label="Strategic must-dos" tone="warning" />
        <Stat value="High" label="Context coupling risk" tone="danger" />
        <Stat value="Strong" label="AI product differentiation" tone="info" />
      </Grid>

      <Divider />

      <H2>1. E2E stress pass — chaotic inputs</H2>
      <Text tone="secondary">
        Source: scripts/test-chaotic-inputs.mjs · deterministic guards (no live
        Gemini required)
      </Text>
      <Table
        headers={["Scenario", "Layer", "Result", "Notes"]}
        rows={STRESS_RESULTS}
        rowTone={STRESS_RESULTS.map(() => "success" as const)}
      />

      <Divider />

      <H2>2. System health & code architecture</H2>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader>Where VAUTO is strongest</CardHeader>
          <CardBody>
            <Stack gap={12}>
              <Stack gap={4}>
                <H3>Conversational listing organism</H3>
                <Text tone="secondary">
                  Text-first Hero Flow with optional photos differentiates vs
                  form-heavy LT classifieds.
                </Text>
              </Stack>
              <Stack gap={4}>
                <H3>Vision + OCR fusion</H3>
                <Text tone="secondary">
                  Lazy-upload vision, tech-passport OCR, gallery vs evidence
                  split, Pass-1/Pass-2 separation.
                </Text>
              </Stack>
              <Stack gap={4}>
                <H3>Domain-bounded AI autonomy</H3>
                <Text tone="secondary">
                  Supervisor tools + structured pipeline + chaotic-input layer
                  keep Gemini inside marketplace rails.
                </Text>
              </Stack>
              <Stack gap={4}>
                <H3>Mobile-first attach surface</H3>
                <Text tone="secondary">
                  System file picker + PDF/DOC facts close ChatGPT-parity gaps
                  for CVs and registration docs.
                </Text>
              </Stack>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Lingering debt & fragile coupling</CardHeader>
          <CardBody>
            <Table
              headers={["Risk", "Item", "Detail"]}
              rows={[
                [
                  "High",
                  "Monolithic client contexts",
                  "Agent/search/seller state concentrated — high blast radius",
                ],
                [
                  "High",
                  "Duplicated shared mirrors",
                  "shared/* vs server/src/shared/* drift risk",
                ],
                [
                  "Med",
                  "No job queue / APM",
                  "Vision + Gemini + PDF on request path",
                ],
                [
                  "Med",
                  "Search without pgvector",
                  "App-side ranking over JSONB catalog",
                ],
                [
                  "Med",
                  "Demo / fallback masking",
                  "Can hide real outages during demos",
                ],
                [
                  "Low",
                  "Unit test gap",
                  "Scripts/e2e strong; pure unit coverage thinner",
                ],
              ]}
              rowTone={[
                "danger",
                "danger",
                "warning",
                "warning",
                "warning",
                "neutral",
              ]}
            />
          </CardBody>
        </Card>
      </Grid>

      <Divider />

      <H2>3. Scalability & performance</H2>
      <Text>
        Hot path couples chat turn → vision/PDF → Gemini supervisor → draft
        sync. Under concurrent sellers this — not Postgres writes — is the
        primary bottleneck.
      </Text>
      <Table
        headers={["Subsystem", "Risk under load", "Mitigation"]}
        rows={[
          [
            "Gemini Vision / Pass-2",
            "p95 spikes, timeout cascades",
            "Queue + progressive draft updates",
          ],
          [
            "PDF/DOC extract in agent",
            "CPU spikes on API dyno",
            "Worker pool; cap size; cache text",
          ],
          [
            "Client agent context wire",
            "Large data-URL payloads",
            "Prefer short-lived object storage",
          ],
          [
            "Catalog search ranking",
            "App-side score over full set",
            "pgvector + SQL facets + pagination",
          ],
          [
            "Express + Playwright scrapers",
            "Noisy neighbor on API process",
            "Isolate scrapers / ops jobs",
          ],
        ]}
      />

      <Divider />

      <H2>4. AI interaction & UX polish</H2>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader>Friction removed this pass</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text>• Typo sell/job create no longer Gemini-only</Text>
              <Text>• ok / nu / 👍 confirm without session reset</Text>
              <Text>• Photo vs text mismatch asks instead of merging</Text>
              <Text>• System file picker + document facts into draft</Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Remaining journey friction</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text>• Buyer discovery still weaker than seller create</Text>
              <Text>• PrePublish prompts can feel repetitive after OCR</Text>
              <Text>• Dual doctrine risk if shared mirrors diverge</Text>
              <Text>• Trust/escrow not yet first-class in chat</Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Divider />

      <H2>5. Top strategic recommendations</H2>
      <Table
        headers={["Priority", "Recommendation", "Why now"]}
        rows={[
          [
            "P0",
            "Unify shared intent package",
            "One @vauto/shared for Next + Express kills browse/confirm/sell drift",
          ],
          [
            "P0",
            "Async vision & document workers",
            "Ack fast; push draft when Vision/PDF ready — protect p95",
          ],
          [
            "P1",
            "Split agent context into modules",
            "Safer iteration on sendAgentMessage / media / PrePublish",
          ],
          [
            "P1",
            "Retrieval upgrade (pgvector + facets)",
            "Industry-leading search needs vector recall + structured filters",
          ],
          [
            "P2",
            "Trust & logistics spine",
            "Real carriers, escrow disputes, idempotent webhooks",
          ],
        ]}
        rowTone={["danger", "danger", "warning", "warning", "info"]}
      />

      <Text tone="tertiary">
        Generated after chaotic-input hardening · target commit:
        test(e2e): harden against chaotic inputs and generate Lead Architect
        strategic report
      </Text>
    </Stack>
  );
}
