import type { DocArticle } from "../types";

export const navigationTheme: DocArticle = {
  slug: "navigation-theme",
  title: "Navigation, shell, and theme",
  description:
    "How the desktop rail, mobile bottom nav, command palette, organization switcher, and light/dark theme preferences work.",
  categoryId: "getting-started",
  keywords: [
    "navigation",
    "rail",
    "bottom nav",
    "theme",
    "command palette",
    "mobile",
  ],
  relatedSlugs: [
    "quick-create-overview",
    "my-day",
    "workspace-concept",
    "install-fieldops-on-phone",
  ],
  sections: [
    {
      id: "desktop",
      heading: "Desktop command center",
      paragraphs: [
        "On viewports about 1024px and wider, FieldOps Cloud uses a collapsible navigation rail plus a top bar. The rail is for primary modules (jobs, schedule, clients, teams, approvals, reports, settings, and related areas depending on role). The top bar surfaces organization context, search/command entry, notifications, quick create, and account/theme controls.",
        "Use Ctrl+K (or the command affordance) to jump to jobs, people, and other entities without hunting through menus. Keyboard focus rings and Radix dialogs keep dense desktop workflows accessible.",
      ],
    },
    {
      id: "mobile",
      heading: "Mobile field shell",
      paragraphs: [
        "On phones, the shell is phone-first: large targets, full-screen sheets, sticky primary actions, and safe-area insets. The bottom navigation is Home | Jobs | Schedule | Time | More. Home is technician-oriented My Day, not a miniature of the desktop dashboard.",
        "Camera-first photo capture and touch signatures are part of job execution on mobile. Primary actions stay clear of the bottom nav and home indicator.",
      ],
    },
    {
      id: "org-and-theme",
      heading: "Organization switcher and theme",
      paragraphs: [
        "If you belong to more than one organization, the organization switcher changes the active workspace. Selection is not authorization — every tenant request still verifies an ACTIVE membership server-side before loading data.",
        "Theme preference (light, dark, or system) is a UI chrome setting stored under a FieldOps theme key. Prefer light for operations work by default; dark is available via tokens. Do not store business records (jobs, clients, timesheets) in browser storage — only chrome flags such as rail collapsed and theme.",
      ],
    },
  ],
};
