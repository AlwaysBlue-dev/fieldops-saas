import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export const AI_SUGGESTED_PROMPTS = [
  "Summarize what FieldKeel AI Workforce is designed to help with.",
  "Suggest a clear checklist for reviewing today’s field jobs.",
  "Help me draft a short status update for operations leadership.",
] as const;

export function AiWelcomeScreen({
  onPickPrompt,
}: {
  onPickPrompt: (prompt: string) => void;
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
          I can help you understand your field operations, organize information
          and make better operational decisions. Ask a question below to start
          this conversation.
        </p>
      </div>
      <div className="w-full space-y-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Try an example
        </p>
        <ul className="flex flex-col gap-2">
          {AI_SUGGESTED_PROMPTS.map((prompt) => (
            <li key={prompt}>
              <Button
                type="button"
                variant="outline"
                className="h-auto w-full justify-start whitespace-normal px-3 py-2.5 text-left text-sm font-normal"
                onClick={() => onPickPrompt(prompt)}
              >
                {prompt}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
