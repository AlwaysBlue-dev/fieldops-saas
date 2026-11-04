import { AiPromptChips } from "./ai-prompt-chips";
import { Sparkles } from "lucide-react";

export function AiWelcomeScreen({
  onPickPrompt,
  disabled,
}: {
  onPickPrompt: (prompt: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-5 px-1 py-6 md:py-10">
      <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Sparkles className="size-5" aria-hidden />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Hello! I&apos;m your FieldKeel AI assistant.
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Ask about today&apos;s jobs, schedules, and field readiness. Use a
          suggested prompt or type your own question below.
        </p>
      </div>
      <div className="w-full space-y-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Suggested prompts
        </p>
        <AiPromptChips
          layout="stack"
          onPick={onPickPrompt}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
