import type { DocArticle } from "../types";

export const timeGps: DocArticle = {
  slug: "time-gps",
  title: "Time tracking and GPS",
  description:
    "Clock in and out create time evidence. GPS is captured on those clock events only — not continuous tracking — and can be required by organization settings.",
  categoryId: "time-gps",
  keywords: [
    "clock in",
    "clock out",
    "GPS",
    "requireGps",
    "timesheet",
    "allowManualTime",
  ],
  relatedSlugs: [
    "job-execution",
    "approvals",
    "location-denied",
    "organization-settings",
  ],
  sections: [
    {
      id: "clock",
      heading: "Clock in and clock out",
      paragraphs: [
        "Technicians clock in and out from My Day, Time, or the job context depending on the flow. Clock events feed timesheets and labour reporting. Open clock sessions can block job approval until closed — approvals validation expects complete time records.",
        "Manual time entry may exist when OrganizationSettings.allowManualTime is enabled. That setting exists in onboarding/schema, but it is not currently editable in the Settings UI — operators should not expect a Settings toggle for allowManualTime yet.",
      ],
    },
    {
      id: "gps",
      heading: "GPS on clock events only",
      paragraphs: [
        "FieldOps Cloud does not continuously track technician location. GPS coordinates are captured on clock in/out events when available. The organization setting requireGps controls whether missing coordinates fail validation for completion or approval workflows.",
        "If the browser or OS denies location permission, clock events may lack coordinates. When requireGps is on, that can block submit or approve until location is allowed or an authorized process addresses the gap. See troubleshooting for location denied.",
      ],
    },
    {
      id: "timesheets",
      heading: "Timesheets and overtime",
      paragraphs: [
        "Hours flow into timesheet entries for review. The approvals inbox handles TIMESHEET and OVERTIME items separately from job completion. Supervisors and managers approve or return time with comments when needed.",
      ],
    },
  ],
};
