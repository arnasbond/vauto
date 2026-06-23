import { getAdminNotifyEmails } from "../repository.js";
import type { ApiSupportReport } from "../types.js";

const APP_ORIGIN = process.env.APP_ORIGIN ?? "https://vauto-chi.vercel.app";

function reportAdminUrl(reportId: string): string {
  return `${APP_ORIGIN}/profile/?report=${encodeURIComponent(reportId)}`;
}

function reportUserUrl(reportId: string): string {
  return `${APP_ORIGIN}/profile/?support=${encodeURIComponent(reportId)}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendEmail(opts: {
  to: string[];
  subject: string;
  html: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey || !opts.to.length) return;

  const from =
    process.env.EMAIL_FROM?.trim() ?? "Vauto <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}

function contactBlock(report: ApiSupportReport): string {
  const lines = [
    report.reporterName,
    report.reporterEmail ? `El. paštas: ${report.reporterEmail}` : null,
    report.reporterPhone ? `Tel.: ${report.reporterPhone}` : null,
  ].filter(Boolean);
  return lines.map((l) => `<p>${escapeHtml(l!)}</p>`).join("");
}

export async function emailAdminsNewReport(
  report: ApiSupportReport
): Promise<void> {
  const to = await getAdminNotifyEmails();
  if (!to.length) return;

  const url = reportAdminUrl(report.id);
  await sendEmail({
    to,
    subject: `[Vauto] Naujas pranešimas — ${report.reporterName}`,
    html: `
      <h2>Naujas vartotojo pranešimas</h2>
      ${contactBlock(report)}
      <p><strong>Kategorija:</strong> ${escapeHtml(report.category)}</p>
      ${report.listingTitle ? `<p><strong>Skelbimas:</strong> ${escapeHtml(report.listingTitle)}</p>` : ""}
      <blockquote>${escapeHtml(report.comment)}</blockquote>
      ${report.aiSummary ? `<p><em>AI: ${escapeHtml(report.aiSummary)}</em></p>` : ""}
      <p><a href="${url}">Atidaryti administratoriaus kabinete</a></p>
    `,
  });
}

export async function emailAdminsUserFollowUp(
  report: ApiSupportReport
): Promise<void> {
  const to = await getAdminNotifyEmails();
  if (!to.length) return;

  await sendEmail({
    to,
    subject: `[Vauto] Papildymas — ${report.reporterName}`,
    html: `
      <h2>Vartotojas papildė pranešimą</h2>
      ${contactBlock(report)}
      <blockquote>${escapeHtml(report.comment)}</blockquote>
      <p><a href="${reportAdminUrl(report.id)}">Atidaryti giją</a></p>
    `,
  });
}

export async function emailReporterReply(
  report: ApiSupportReport,
  replyPreview: string
): Promise<void> {
  if (!report.reporterEmail?.trim()) return;

  await sendEmail({
    to: [report.reporterEmail.trim()],
    subject: "[Vauto] Atsakymas į jūsų pranešimą",
    html: `
      <h2>Gavote atsakymą iš Vauto komandos</h2>
      <blockquote>${escapeHtml(replyPreview)}</blockquote>
      <p><a href="${reportUserUrl(report.id)}">Peržiūrėti visą pokalbio giją</a></p>
    `,
  });
}
