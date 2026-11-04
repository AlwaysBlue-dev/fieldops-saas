"use client";

import { Button } from "@/components/ui/button";
import { cn } from "cn";

/** High-value ops prompts aligned with read-only AI tools. */
export const AI_PROMPT_CHIPS = [
  {
    id: "jobs-today",
    label: "Jobs for today",
    prompt: "What jobs are scheduled for today?",
  },
  {
    id: "missing-access",
    label: "Missing access",
    prompt: "Who is missing access for today's jobs?",
  },
  {
    id: "my-schedule",
    label: "My schedule",
    prompt: "Show my schedule for today.",
  },
  {
    id: "overdue-jobs",
    label: "Overdue jobs",
    prompt: "Which jobs are overdue or at risk right now?",
  },
] as const;

export type AiPromptChip = (typeof AI_PROMPT_CHIPS)[number];

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
        layout === "stack"
          ? "flex flex-col gap-2"
          : "flex flex-wrap gap-2",
        className,
      )}
      role="list"
    >
      {AI_PROMPT_CHIPS.map((chip) => (
        <li key={chip.id} className={layout === "stack" ? "w-full" : undefined}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className={cn(
              "h-auto min-h-9 font-normal text-foreground",
              layout === "stack"
                ? "w-full justify-start whitespace-normal px-3 py-2.5 text-left text-sm"
                : "rounded-full px-3 py-1.5 text-xs md:text-sm",
            )}
            onClick={() => onPick(chip.prompt)}
          >
            {layout === "stack" ? chip.prompt : chip.label}
          </Button>
        </li>
      ))}
    </ul>
  );
}
