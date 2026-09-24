import type { DocArticle } from "../types";

export const whatIsFieldops: DocArticle = {
  slug: "what-is-fieldops",
  title: "What is FieldOps Cloud?",
  description:
    "FieldOps Cloud is an operations command center for field-service companies — office staff plan and approve work; technicians run the day from a phone-first shell.",
  categoryId: "getting-started",
  keywords: [
    "fieldops",
    "overview",
    "field service",
    "dispatch",
    "technicians",
    "multi-tenant",
  ],
  relatedSlugs: [
    "create-account-workspace",
    "trial-onboarding",
    "workspace-concept",
    "roles",
  ],
  sections: [
    {
      id: "promise",
      heading: "The core promise",
      paragraphs: [
        "FieldOps Cloud is built for electrical, HVAC, plumbing, fire/security, maintenance, and facilities contractors who need one organization workspace where office staff can plan, dispatch, and approve work, and field technicians can see their day, capture evidence, and account for the hours they actually worked.",
        "The product is designed as a premium operations command center: dense and keyboard-friendly on desktop, large-target and camera-first on mobile. It is not a generic CRM, not a consumer marketplace that matches random technicians to jobs, and not a white-label of a prior client project.",
      ],
    },
    {
      id: "who-uses-it",
      heading: "Who uses it",
      paragraphs: [
        "Owners care about utilization, overtime cost, and whether work is actually getting done. Administrators set up the organization: users, roles, clients, sites, and settings. Operations managers own the board — jobs, schedule, dispatch, and the approvals inbox. Supervisors own a crew and review exceptions, timesheets, and incomplete job cards. Technicians work from a phone, often outdoors, and need today’s jobs, clock in/out, GPS evidence on clock events, photos, materials, notes, and client signatures.",
        "A single person can belong to more than one organization. Organization role always lives on membership, never as a global user property — so someone can be OWNER of one company and TECHNICIAN in another.",
      ],
    },
    {
      id: "what-you-get",
      heading: "What you get in the workspace",
      paragraphs: [
        "Inside an organization you manage clients (your customers) and their sites, teams and technician profiles, job cards with a enforced lifecycle, a schedule board with drag-and-drop, My Day for field crews, clock events with optional GPS, job execution evidence, an approvals inbox for job completions, timesheets, and overtime, operational reports with CSV and job PDF exports, and org-wide file storage under a plan quota.",
        "Commercial access is organization-scoped. New workspaces start on a 14-day Professional trial with no card required, then a short grace period before the workspace becomes read-only until FieldOps activates a paid plan by manual invoice.",
      ],
    },
    {
      id: "not-included",
      heading: "What this documentation does not claim",
      paragraphs: [
        "FieldOps Cloud documentation does not claim SOC 2, ISO, or HIPAA certification. Security practices described elsewhere (HTTP-only session cookies, tenant isolation, private object storage) are product design choices — not third-party compliance attestations.",
      ],
    },
  ],
};
