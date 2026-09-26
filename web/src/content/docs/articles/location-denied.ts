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
      heading: "What FieldKeel captures",
      paragraphs: [
        "FieldKeel does not continuously track technicians. Coordinates attach to clock in and clock out events when the device provides them. If permission is denied or location services are unavailable, FieldKeel shows a clear message and does not invent a location.",
      ],
    },
    {
      id: "messages",
      heading: "What you will see",
      paragraphs: [
        "If location permission is turned off, FieldKeel asks you to allow location access for FieldKeel in browser or device settings, then try again.",
        "If FieldKeel cannot access your current location, it asks you to turn on location services and allow access, then try again.",
        "If the lookup takes too long, you can try again. If the browser cannot provide location at all, FieldKeel explains that a supported browser or device is needed.",
      ],
    },
    {
      id: "require-gps",
      heading: "When requireGps is on",
      paragraphs: [
        "Organizations that enable requireGps expect coordinates on clock evidence before submit/approve succeeds. Approvals refuse job completion when GPS is required and coordinates are missing. Allow location for FieldKeel, clock again if needed, then resubmit.",
        "If crews cannot reliably grant location (policy devices, indoor sites), owners should reconsider requireGps in organization settings rather than training people to bypass approvals.",
      ],
    },
  ],
};
