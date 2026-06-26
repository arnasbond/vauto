import type { Listing } from "@/lib/types";
import { isJobOffer } from "@/lib/jobs";
import { JOB_TYPE_OFFER } from "@/lib/jobs";

const STORAGE_KEY = "vauto_job_applications_v1";

export interface JobApplication {
  id: string;
  listingId: string;
  employerId: string;
  applicantName: string;
  jobTitle: string;
  email: string;
  cvFileUrl: string;
  message?: string;
  createdAt: string;
  status: "new" | "reviewed" | "shortlisted" | "rejected";
}

function loadAll(): JobApplication[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as JobApplication[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(apps: JobApplication[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
}

export function getApplicationsForListing(listingId: string): JobApplication[] {
  return loadAll()
    .filter((a) => a.listingId === listingId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getApplicationsForEmployer(employerId: string): JobApplication[] {
  return loadAll()
    .filter((a) => a.employerId === employerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function submitJobApplication(input: {
  listing: Listing;
  applicantName: string;
  email: string;
  cvFileUrl: string;
  message?: string;
}): JobApplication {
  const app: JobApplication = {
    id: `app-${Date.now()}`,
    listingId: input.listing.id,
    employerId: input.listing.sellerId,
    applicantName: input.applicantName,
    jobTitle: input.listing.title,
    email: input.email,
    cvFileUrl: input.cvFileUrl,
    message: input.message,
    createdAt: new Date().toISOString(),
    status: "new",
  };
  saveAll([app, ...loadAll()]);
  return app;
}

export function updateApplicationStatus(
  id: string,
  status: JobApplication["status"]
): void {
  saveAll(loadAll().map((a) => (a.id === id ? { ...a, status } : a)));
}

/** Demo paraiškos darbdaviui — rodoma tik jei nėra realių */
export function seedDemoApplicationsIfEmpty(
  employerId: string,
  jobListings: Listing[]
): JobApplication[] {
  const existing = getApplicationsForEmployer(employerId);
  if (existing.length > 0) return existing;

  const offers = jobListings.filter(isJobOffer);
  if (offers.length === 0) return [];

  const demos: JobApplication[] = offers.slice(0, 2).map((listing, i) => ({
    id: `demo-app-${listing.id}`,
    listingId: listing.id,
    employerId,
    applicantName: i === 0 ? "Giedrė Kazlauskaitė" : "Tomas Petraitis",
    jobTitle: listing.title,
    email: i === 0 ? "giedre.k@email.lt" : "tomas.p@email.lt",
    cvFileUrl: i === 0 ? "https://example.com/cv-giedre.pdf" : "https://example.com/cv-tomas.docx",
    message: "Domina ši pozicija, turiu atitinkamą patirtį.",
    createdAt: new Date(Date.now() - i * 86_400_000).toISOString(),
    status: "new" as const,
  }));

  saveAll([...demos, ...loadAll()]);
  return demos;
}

export function isEmployerJobListing(listing: Listing): boolean {
  return listing.category === "jobs" && listing.attributes?.jobType !== "Ieškau darbo";
}

export { JOB_TYPE_OFFER };
