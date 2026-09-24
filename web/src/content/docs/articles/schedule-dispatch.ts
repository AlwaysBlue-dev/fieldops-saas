import type { DocArticle } from "../types";

export const scheduleDispatch: DocArticle = {
  slug: "schedule-dispatch",
  title: "Schedule and dispatch",
  description:
    "Plan work on the schedule board, assign crews, and use drag-and-drop to place jobs across technicians and time.",
  categoryId: "schedule-dispatch",
  keywords: [
    "schedule",
    "dispatch",
    "drag and drop",
    "board",
    "assign",
  ],
  relatedSlugs: [
    "jobs-overview",
    "job-lifecycle",
    "teams-technicians-overview",
    "my-day",
  ],
  sections: [
    {
      id: "board",
      heading: "Desktop schedule board",
      paragraphs: [
        "The desktop schedule shows technicians against time with jobs as blocks for a day or week view. Unassigned or overflow work can sit in a queue until you place it. Organization timezone defines calendar boundaries for “today” and scheduled windows.",
        "Drag-and-drop lets operations managers and other authorized roles move job blocks to different technicians or times without re-entering the entire card. After placement, the job still follows the enforced status lifecycle — scheduling does not skip dispatch or completion rules.",
      ],
    },
    {
      id: "mobile",
      heading: "Mobile schedule",
      paragraphs: [
        "On mobile, Schedule focuses on the technician’s upcoming window rather than the full office board. Combined with My Day, crews see what is coming without the density of the desktop command center.",
      ],
    },
    {
      id: "dispatch-flow",
      heading: "From schedule to field",
      paragraphs: [
        "Typical flow: create or finalize a job (often DRAFT), place it on the schedule (SCHEDULED), dispatch to the crew (DISPATCHED), then the technician clocks in and work moves to IN_PROGRESS. See the job lifecycle article for the full status path including PENDING_APPROVAL, RETURNED, and CANCELLED.",
        "Conflict awareness (double-booking warnings) may appear as guidance. Treat schedule edits as operational decisions — confirm client windows and travel time before locking a day.",
      ],
    },
  ],
};
