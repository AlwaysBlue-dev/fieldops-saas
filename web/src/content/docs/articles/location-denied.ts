import type { DocArticle } from "../types";

export const locationDenied: DocArticle = {
  slug: "location-denied",
  title: "Location permission denied",
  description:
    "GPS is only captured on clock in/out. When requireGps is enabled, denied browser or OS location permission can block completion or approval.",
  categoryId: "troubleshooting",
  keywords: [
    "location",
    "GPS",
    "permission",
    "requireGps",
    "clock",
  ],
  relatedSlugs: [
    "time-gps",
    "organization-settings",
    "approvals",
    "job-execution",
  ],
  sections: [
    {
      id: "model",
      heading: "What FieldOps captures",
      paragraphs: [
        "FieldOps Cloud does not continuously track technicians. Coordinates attach to clock in and clock out events when the device provides them. If permission is denied, those events may be stored without coordinates.",
      ],
    },
    {
      id: "require-gps",
      heading: "When requireGps is on",
      paragraphs: [
        "Organizations that enable requireGps expect coordinates on clock evidence before submit/approve succeeds. Approvals refuse job completion when GPS is required and coordinates are missing. Ask the technician to enable location for the FieldOps site/app, clock again if needed, then resubmit.",
        "If crews cannot reliably grant location (policy devices, indoor sites), owners should reconsider requireGps in organization settings rather than training people to bypass approvals.",
      ],
    },
  ],
};
