"use client";

import { Button } from "@/components/ui/button";
import { cn } from "cn";

/** Lightweight suggested next questions after an assistant answer. */
export function suggestFollowUps(input: {
  lastUserContent: string | null;
  lastAssistantContent: string | null;
}): string[] {
  const user = (input.lastUserContent ?? "").toLowerCase();
  const assistant = (input.lastAssistantContent ?? "").toLowerCase();
  const suggestions: string[] = [];

  const push = (prompt: string) => {
    if (suggestions.length >= 3) return;
    if (suggestions.some((s) => s.toLowerCase() === prompt.toLowerCase())) {
      return;
    }
    suggestions.push(prompt);
  };

  if (
    user.includes("today") ||
    assistant.includes("today only") ||
    assistant.includes("for today")
  ) {
    push("What about this week instead?");
  }
  if (
    user.includes("missing access") ||
    assistant.includes("missing access") ||
    assistant.includes("access notes")
  ) {
    push("Which of those are high priority?");
    push("Which are still unassigned?");
  }
  if (
    user.includes("unassigned") ||
    assistant.includes("unassigned") ||
    assistant.includes("no technician")
  ) {
    push("Break those down by day this week.");
    push("Which technicians already have the most jobs this week?");
  }
  if (user.includes("overdue") || assistant.includes("overdue")) {
    push("Which overdue jobs are missing access info?");
    push("Show only high-priority overdue jobs.");
  }
  if (user.includes("schedule") || assistant.includes("schedule")) {
    push("Which of those jobs are unassigned?");
  }

  push("List open jobs missing site access.");
  push("Which jobs this week have no technician assigned?");
  push("Summarize high-priority open jobs.");

  return suggestions.slice(0, 3);
}

export function AiFollowUpChips({
  prompts,
  onPick,
  disabled,
  className,
}: {
  prompts: string[];
  onPick: (prompt: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  if (prompts.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Suggested follow-ups
      </p>
      <ul className="flex flex-col gap-1.5" role="list">
        {prompts.map((prompt) => (
          <li key={prompt}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              className="h-auto min-h-9 w-full justify-start whitespace-normal rounded-lg border border-border/80 bg-card px-3 py-2 text-left text-xs font-normal text-foreground hover:border-primary/30 hover:bg-accent/50"
              onClick={() => onPick(prompt)}
            >
              {prompt}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
