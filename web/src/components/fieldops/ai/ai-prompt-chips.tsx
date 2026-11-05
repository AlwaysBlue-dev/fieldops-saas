"use client";

import { Button } from "@/components/ui/button";
import { cn } from "cn";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CalendarDays,
  ListTodo,
  LockKeyhole,
  MapPin,
  Users,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

/** High-value ops prompts: lookups + propose-only CRUD. */
export const AI_PROMPT_CHIPS: ReadonlyArray<{
  id: string;
  label: string;
  prompt: string;
  icon: LucideIcon;
}> = [
  {
    id: "jobs-today",
    label: "Jobs for today",
    prompt:
      "What jobs are scheduled for today? If none, say today only and offer to check this week.",
    icon: ListTodo,
  },
  {
    id: "missing-access",
    label: "Missing access",
    prompt:
      "Which open jobs are missing site access information? Do not limit to today unless I ask.",
    icon: LockKeyhole,
  },
  {
    id: "my-schedule",
    label: "My schedule",
    prompt: "Show my schedule for today.",
    icon: CalendarDays,
  },
  {
    id: "overdue-jobs",
    label: "Overdue jobs",
    prompt: "Which jobs are overdue or at risk right now?",
    icon: AlertTriangle,
  },
  {
    id: "draft-job",
    label: "Draft a job",
    prompt:
      "Help me draft a new job proposal. Ask for client, site, title, and job type if needed, then use proposeAction — do not claim it was created until approved.",
    icon: ListTodo,
  },
  {
    id: "assign-tech",
    label: "Assign technician",
    prompt:
      "Propose assigning a technician to an unassigned job. Look up the job first, then proposeAction with job.assign for approval.",
    icon: UserPlus,
  },
  {
    id: "reschedule-job",
    label: "Reschedule job",
    prompt:
      "Propose rescheduling a job. Confirm the job number and new times, then proposeAction with job.schedule for approval.",
    icon: CalendarClock,
  },
  {
    id: "create-client",
    label: "Create client",
    prompt:
      "Propose creating a new client. Ask for the client name (and optional primaryContactEmail/phone). When ready, call proposeAction with actionType client.create and payload { name } — do not claim it was created until approved.",
    icon: Building2,
  },
  {
    id: "add-site",
    label: "Add a site",
    prompt:
      "Propose adding a site for a client. Resolve the clientId first, then proposeAction with site.create for approval.",
    icon: MapPin,
  },
  {
    id: "deactivate-team",
    label: "Deactivate team",
    prompt:
      "Propose deactivating a team after I confirm the team name. Use proposeAction with team.deactivate and remind me a manager must approve.",
    icon: Users,
  },
];

export function AiPromptChips({
  onPick,
  disabled,
  layout = "wrap",
  className,
}: {
  onPick: (prompt: string) => void;
  disabled?: boolean;
  layout?: "wrap" | "stack";
  className?: string;
}) {
  return (
    <ul
      className={cn(
        layout === "stack" ? "flex flex-col gap-2" : "flex flex-wrap gap-2",
        className,
      )}
      role="list"
    >
      {AI_PROMPT_CHIPS.map((chip) => {
        const Icon = chip.icon;
        return (
          <li
            key={chip.id}
            className={layout === "stack" ? "w-full" : undefined}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className={cn(
                "h-auto min-h-11 gap-2 border-border/90 bg-card font-normal text-foreground shadow-none transition-colors hover:border-primary/35 hover:bg-accent/60 sm:min-h-9",
                layout === "stack"
                  ? "w-full justify-start whitespace-normal px-3 py-2.5 text-left text-sm"
                  : "rounded-lg px-3 py-2 text-xs sm:py-1.5 md:text-sm",
              )}
              onClick={() => onPick(chip.prompt)}
            >
              <Icon
                className="size-3.5 shrink-0 text-primary"
                aria-hidden
              />
              <span>{layout === "stack" ? chip.prompt : chip.label}</span>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
