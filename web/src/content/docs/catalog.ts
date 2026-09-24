import type { DocArticle, DocCategory } from "./types";

import { whatIsFieldops } from "./articles/what-is-fieldops";
import { createAccountWorkspace } from "./articles/create-account-workspace";
import { verifyWorkEmail } from "./articles/verify-work-email";
import { trialOnboarding } from "./articles/trial-onboarding";
import { navigationTheme } from "./articles/navigation-theme";
import { quickCreateOverview } from "./articles/quick-create-overview";

import { workspaceConcept } from "./articles/workspace-concept";
import { membersInvitations } from "./articles/members-invitations";
import { roles } from "./articles/roles";

import { clientsOverview } from "./articles/clients-overview";
import { clientsManage } from "./articles/clients-manage";

import { sitesOverview } from "./articles/sites-overview";
import { sitesAccess } from "./articles/sites-access-notes";

import { teamsTechniciansOverview } from "./articles/teams-technicians-overview";

import { scheduleDispatch } from "./articles/schedule-dispatch";

import { jobsOverview } from "./articles/jobs-overview";
import { jobLifecycle } from "./articles/job-lifecycle";

import { myDay } from "./articles/my-day";

import { timeGps } from "./articles/time-gps";

import { jobExecution } from "./articles/job-execution";

import { approvals } from "./articles/approvals";

import { reports } from "./articles/reports";

import { storageOverview } from "./articles/storage-overview";
import { storageLimitReached } from "./articles/storage-limit-reached";

import { billingPlans } from "./articles/billing-plans";

import { organizationSettings } from "./articles/organization-settings";

import { securityPrivacy } from "./articles/security-privacy";

import { cannotInvite } from "./articles/cannot-invite";
import { workspaceReadonly } from "./articles/workspace-readonly";
import { cannotUpload } from "./articles/cannot-upload";
import { locationDenied } from "./articles/location-denied";
import { missingQuickCreate } from "./articles/missing-quick-create";
import { forgotPassword } from "./articles/forgot-password";

export const allCategories: DocCategory[] = [
  {
    id: "getting-started",
    title: "Getting started",
    description:
      "Product overview, account setup, trial, and how to move around the app.",
    order: 10,
    primarySlug: "what-is-fieldops",
  },
  {
    id: "organizations-members",
    title: "Organizations & members",
    description:
      "Workspaces, invitations, membership, and organization roles.",
    order: 20,
    primarySlug: "workspace-concept",
  },
  {
    id: "clients",
    title: "Clients",
    description: "Your customers inside an organization workspace.",
    order: 30,
    primarySlug: "clients-overview",
  },
  {
    id: "sites",
    title: "Sites",
    description: "Job locations, access notes, and on-site contacts.",
    order: 40,
    primarySlug: "sites-overview",
  },
  {
    id: "teams-technicians",
    title: "Teams & technicians",
    description: "Crews, profiles, skills, and certifications.",
    order: 50,
    primarySlug: "teams-technicians-overview",
  },
  {
    id: "schedule-dispatch",
    title: "Schedule & dispatch",
    description: "Board planning, assignments, and drag-and-drop scheduling.",
    order: 60,
    primarySlug: "schedule-dispatch",
  },
  {
    id: "jobs",
    title: "Jobs",
    description: "Job cards, lifecycle statuses, and completion outcomes.",
    order: 70,
    primarySlug: "jobs-overview",
  },
  {
    id: "my-day",
    title: "My Day",
    description: "Technician home for today’s assigned work.",
    order: 80,
    primarySlug: "my-day",
  },
  {
    id: "time-gps",
    title: "Time & GPS",
    description: "Clock events, timesheets, and GPS on clock in/out only.",
    order: 90,
    primarySlug: "time-gps",
  },
  {
    id: "job-execution",
    title: "Job execution",
    description: "Field evidence: notes, materials, photos, and signatures.",
    order: 100,
    primarySlug: "job-execution",
  },
  {
    id: "approvals",
    title: "Approvals",
    description: "Job completion, timesheet, and overtime decisions.",
    order: 110,
    primarySlug: "approvals",
  },
  {
    id: "reports",
    title: "Reports",
    description: "Summary KPIs, labour, job tables, CSV, and job PDFs.",
    order: 120,
    primarySlug: "reports",
  },
  {
    id: "quick-create",
    title: "Quick Create",
    description: "Top-bar shortcuts to start common records quickly.",
    order: 130,
    primarySlug: "quick-create-overview",
  },
  {
    id: "files-storage",
    title: "Files & storage",
    description: "Org-wide quota, uploads, and what to do when storage is full.",
    order: 140,
    primarySlug: "storage-overview",
  },
  {
    id: "billing",
    title: "Billing & plans",
    description: "Starter, Professional, Business, trial, and manual activation.",
    order: 150,
    primarySlug: "billing-plans",
  },
  {
    id: "organization-settings",
    title: "Organization settings",
    description: "Timezone, evidence rules, branding, storage, and plan screens.",
    order: 160,
    primarySlug: "organization-settings",
  },
  {
    id: "security-privacy",
    title: "Security & privacy",
    description: "Sessions, isolation, and honest security boundaries.",
    order: 170,
    primarySlug: "security-privacy",
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    description: "Common blockers for invites, uploads, GPS, and access.",
    order: 180,
    primarySlug: "cannot-invite",
  },
];

/**
 * Canonical article order: category order, then the sequence below within each category.
 * Adjacent navigation follows this array.
 */
export const allArticles: DocArticle[] = [
  whatIsFieldops,
  createAccountWorkspace,
  verifyWorkEmail,
  forgotPassword,
  trialOnboarding,
  navigationTheme,
  quickCreateOverview,
  workspaceConcept,
  membersInvitations,
  roles,
  clientsOverview,
  clientsManage,
  sitesOverview,
  sitesAccess,
  teamsTechniciansOverview,
  scheduleDispatch,
  jobsOverview,
  jobLifecycle,
  myDay,
  timeGps,
  jobExecution,
  approvals,
  reports,
  storageOverview,
  storageLimitReached,
  billingPlans,
  organizationSettings,
  securityPrivacy,
  cannotInvite,
  workspaceReadonly,
  cannotUpload,
  locationDenied,
  missingQuickCreate,
];

const articleBySlug = new Map(
  allArticles.map((article) => [article.slug, article] as const),
);

function normalizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,/|;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function articleSearchBlob(article: DocArticle): string {
  const sectionText = article.sections
    .flatMap((section) => [section.heading, ...section.paragraphs])
    .join(" ");
  return [
    article.slug,
    article.title,
    article.description,
    article.categoryId,
    ...article.keywords,
    sectionText,
  ]
    .join(" ")
    .toLowerCase();
}

/** Case-insensitive search across title, description, keywords, and section prose. */
export function searchArticles(query: string): DocArticle[] {
  const tokens = normalizeQuery(query);
  if (tokens.length === 0) return [];

  const scored: { article: DocArticle; score: number }[] = [];

  for (const article of allArticles) {
    const blob = articleSearchBlob(article);
    let score = 0;
    let matchedAll = true;

    for (const token of tokens) {
      if (!blob.includes(token)) {
        matchedAll = false;
        break;
      }
      if (article.slug === token || article.slug.includes(token)) score += 8;
      if (article.title.toLowerCase().includes(token)) score += 6;
      if (article.keywords.some((keyword) => keyword.toLowerCase().includes(token)))
        score += 4;
      if (article.description.toLowerCase().includes(token)) score += 2;
      score += 1;
    }

    if (matchedAll) scored.push({ article, score });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score || a.article.title.localeCompare(b.article.title),
  );
  return scored.map((entry) => entry.article);
}

export function getArticle(slug: string): DocArticle | undefined {
  return articleBySlug.get(slug);
}

export function getAdjacentArticles(slug: string): {
  previous: DocArticle | null;
  next: DocArticle | null;
} {
  const index = allArticles.findIndex((article) => article.slug === slug);
  if (index < 0) {
    return { previous: null, next: null };
  }

  const current = allArticles[index];
  const sameCategory = allArticles.filter(
    (article) => article.categoryId === current.categoryId,
  );
  const localIndex = sameCategory.findIndex((article) => article.slug === slug);

  return {
    previous: localIndex > 0 ? sameCategory[localIndex - 1] : null,
    next:
      localIndex >= 0 && localIndex < sameCategory.length - 1
        ? sameCategory[localIndex + 1]
        : null,
  };
}

export function getCategory(categoryId: string): DocCategory | undefined {
  return allCategories.find((category) => category.id === categoryId);
}

export function getArticlesByCategory(categoryId: string): DocArticle[] {
  return allArticles.filter((article) => article.categoryId === categoryId);
}

/** Default article for a category (nav category click target). */
export function getPrimaryArticle(categoryId: string): DocArticle | undefined {
  const category = getCategory(categoryId);
  if (!category) return undefined;
  return (
    getArticle(category.primarySlug) ?? getArticlesByCategory(categoryId)[0]
  );
}
