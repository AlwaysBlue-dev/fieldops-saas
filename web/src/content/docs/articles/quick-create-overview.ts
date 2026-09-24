import type { DocArticle } from "../types";

export const quickCreateOverview: DocArticle = {
  slug: "quick-create-overview",
  title: "Quick Create overview",
  description:
    "Use Quick Create from the top bar to start common records without leaving your current screen — subject to role and subscription write access.",
  categoryId: "quick-create",
  keywords: [
    "quick create",
    "new job",
    "new client",
    "shortcuts",
    "top bar",
  ],
  relatedSlugs: [
    "jobs-overview",
    "clients-overview",
    "missing-quick-create",
    "workspace-readonly",
  ],
  sections: [
    {
      id: "where",
      heading: "Where Quick Create lives",
      paragraphs: [
        "Quick Create opens from the top bar as a sheet of create shortcuts. It is meant for office and field leads who need to spin up a job, client, site, team, or similar record without navigating away from the current module.",
        "On mobile, the same sheet pattern keeps create flows full-screen and thumb-friendly. After you finish, you return to the context you were in.",
      ],
    },
    {
      id: "permissions",
      heading: "Who sees which actions",
      paragraphs: [
        "Available create actions depend on your organization role and whether the workspace can mutate. Technicians typically see fewer create options than OWNER, ADMIN, or OPERATIONS_MANAGER. If the subscription is trial-expired, suspended, or cancelled, create actions disable with messaging that the workspace is read-only until activation.",
        "If an expected shortcut is missing, check role, active organization, and subscription status before assuming a product bug. See the troubleshooting article on missing Quick Create.",
      ],
    },
    {
      id: "after-create",
      heading: "After you create something",
      paragraphs: [
        "New jobs still follow the job lifecycle — creating a draft does not dispatch it. New clients and sites become available for job assignment immediately inside the same organization. Invites still go through Members, not Quick Create.",
      ],
    },
  ],
};
