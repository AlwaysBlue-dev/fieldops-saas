"use client";

import type { AiChoiceOption } from "./ai-choices";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

export function AiSelectionChips({
  choices,
  onPick,
  disabled,
  className,
}: {
  choices: AiChoiceOption[];
  onPick: (send: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  if (choices.length === 0) return null;

  return (
    <div className={cn("flex w-full max-w-5xl flex-col gap-2", className)}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Tap to select
      </p>
      <ul className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap" role="list">
        {choices.map((choice) => (
          <li key={`${choice.label}:${choice.send}`} className="min-w-0 sm:max-w-full">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className="h-auto min-h-11 w-full justify-start whitespace-normal rounded-lg border-primary/25 bg-card px-3 py-2.5 text-left text-sm font-medium text-foreground hover:border-primary/50 hover:bg-accent/60 sm:min-h-10 sm:w-auto"
              onClick={() => onPick(choice.send)}
            >
              {choice.label}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
