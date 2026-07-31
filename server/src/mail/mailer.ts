/**
 * Single Resend transport for every transactional email.
 * Without RESEND_API_KEY the calls become no-ops so local dev never throws.
 */
const APP_ORIGIN = (process.env.APP_ORIGIN ?? "https://www.vauto.lt").replace(/\/$/, "");

export function appUrl(path = "/"): string {
  return `${APP_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "1 234,50 €" — Lithuanian formatting, space before the currency symbol. */
export function formatEur(amount: number): string {
  return `${new Intl.NumberFormat("lt-LT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} €`;
}

export function isMailerConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendEmail(opts: {
  to: string[];
  subject: string;
  html: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const recipients = opts.to.map((t) => t.trim()).filter(Boolean);
  if (!apiKey || !recipients.length) return false;

  const from = process.env.EMAIL_FROM?.trim() ?? "VAUTO <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: opts.subject,
      html: opts.html,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
  return true;
}

export interface EmailRow {
  label: string;
  value: string;
}

/** Inline styles only — Gmail and Outlook strip <style> blocks. */
export function renderEmailLayout(opts: {
  heading: string;
  intro: string;
  rows?: EmailRow[];
  highlight?: { title: string; body: string };
  cta?: { label: string; url: string };
  footnote?: string;
}): string {
  const rows = (opts.rows ?? [])
    .filter((row) => row.value.trim().length > 0)
    .map(
      (row) => `
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:13px;">${escapeHtml(row.label)}</td>
          <td style="padding:8px 0;color:#0f172a;font-size:13px;font-weight:600;text-align:right;">${escapeHtml(row.value)}</td>
        </tr>`
    )
    .join("");

  const highlight = opts.highlight
    ? `
      <div style="margin:20px 0;padding:14px 16px;border-radius:12px;background:#f1f5f9;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#475569;">${escapeHtml(opts.highlight.title)}</p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#0f172a;">${escapeHtml(opts.highlight.body)}</p>
      </div>`
    : "";

  const cta = opts.cta
    ? `
      <p style="margin:24px 0 0;">
        <a href="${opts.cta.url}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">${escapeHtml(opts.cta.label)}</a>
      </p>`
    : "";

  return `
  <div style="margin:0;padding:24px 12px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:28px;border-radius:18px;background:#ffffff;box-shadow:0 6px 24px -12px rgba(15,23,42,0.18);">
      <p style="margin:0 0 18px;font-size:15px;font-weight:800;letter-spacing:-0.02em;color:#0f172a;">VAUTO</p>
      <h1 style="margin:0 0 10px;font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;">${escapeHtml(opts.heading)}</h1>
      <p style="margin:0;font-size:14px;line-height:1.65;color:#475569;">${escapeHtml(opts.intro)}</p>
      ${rows ? `<table role="presentation" style="width:100%;margin-top:18px;border-top:1px solid #e2e8f0;border-collapse:collapse;">${rows}</table>` : ""}
      ${highlight}
      ${cta}
      ${opts.footnote ? `<p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;">${escapeHtml(opts.footnote)}</p>` : ""}
    </div>
    <p style="max-width:560px;margin:14px auto 0;font-size:11px;color:#94a3b8;text-align:center;">Šis laiškas išsiųstas automatiškai iš VAUTO platformos.</p>
  </div>`;
}
