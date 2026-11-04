"use client";

import { Button } from "@/components/ui/button";
import { cn } from "cn";
import {
  AlertTriangle,
  CalendarDays,
  ListTodo,
  LockKeyhole,
  type LucideIcon,
} from "lucide-react";

/** High-value ops prompts aligned with read-only AI tools. */
export const AI_PROMPT_CHIPS: ReadonlyArray<{
  id: string;
  label: string;
  prompt: string;
  icon: LucideIcon;
}> = [
  {
    id: "jobs-today",
    label: "Jobs for today",
    prompt: "What jobs are scheduled for today?",
    icon: ListTodo,
  },
  {
    id: "missing-access",
    label: "Missing access",
    prompt: "Who is missing access for today's jobs?",
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
                "h-auto min-h-9 gap-2 border-border/90 bg-card font-normal text-foreground shadow-none transition-colors hover:border-primary/35 hover:bg-accent/60",
                layout === "stack"
                  ? "w-full justify-start whitespace-normal px-3 py-2.5 text-left text-sm"
                  : "rounded-lg px-3 py-1.5 text-xs md:text-sm",
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
