import { AiPromptChips } from "./ai-prompt-chips";
import { CalendarDays, LockKeyhole, ListTodo, Sparkles } from "lucide-react";

const CAPABILITIES = [
  {
    icon: ListTodo,
    title: "Jobs",
    detail: "Today’s work and status at a glance",
  },
  {
    icon: CalendarDays,
    title: "Schedule",
    detail: "Who is booked and what’s next",
  },
  {
    icon: LockKeyhole,
    title: "Access",
    detail: "Missing site access before arrival",
  },
] as const;

export function AiWelcomeScreen({
  onPickPrompt,
  disabled,
}: {
  onPickPrompt: (prompt: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-1 py-6 md:py-10">
      <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-raise">
        <div
          className="absolute inset-y-0 left-0 w-1 bg-primary"
          aria-hidden
        />
        <div className="flex flex-col gap-4 p-5 pl-6">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-5" aria-hidden />
          </div>
          <div className="space-y-1.5">
            <p className="type-label text-muted-foreground">AI Workforce</p>
            <h2 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">
              Ask your operations desk
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Live answers from your FieldKeel data — jobs, schedules, and
              access readiness. Pick a prompt or type your own question.
            </p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-3">
            {CAPABILITIES.map((item) => (
              <li
                key={item.title}
                className="rounded-lg border border-border/80 bg-workspace/80 px-3 py-2.5"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <item.icon
                    className="size-3.5 text-primary"
                    aria-hidden
                  />
                  {item.title}
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {item.detail}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="space-y-2.5">
        <p className="type-label text-muted-foreground">Suggested prompts</p>
        <AiPromptChips
          layout="stack"
          onPick={onPickPrompt}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
