import { AiPromptChips } from "./ai-prompt-chips";
import { CalendarDays, LockKeyhole, ListTodo, Sparkles } from "lucide-react";

const CAPABILITIES = [
  {
    icon: ListTodo,
    title: "Jobs",
    detail: "Today’s work and status",
  },
  {
    icon: CalendarDays,
    title: "Schedule",
    detail: "Who is booked next",
  },
  {
    icon: LockKeyhole,
    title: "Access",
    detail: "Missing site access",
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 py-4 sm:gap-5 sm:py-6">
      <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-raise">
        <div
          className="absolute inset-y-0 left-0 w-1 bg-primary"
          aria-hidden
        />
        <div className="flex flex-col gap-3 p-4 pl-5 sm:flex-row sm:items-start sm:gap-4 sm:p-5 sm:pl-6">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="type-label text-muted-foreground">AI Workforce</p>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Ask your operations desk
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Live answers from FieldKeel — jobs, schedules, and access. Propose
              client or job changes for approval.
            </p>
            <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {CAPABILITIES.map((item) => (
                <li
                  key={item.title}
                  className="rounded-lg border border-border/80 bg-workspace/80 px-3 py-2"
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <item.icon
                      className="size-3.5 text-primary"
                      aria-hidden
                    />
                    {item.title}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    {item.detail}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="type-label text-muted-foreground">Suggested prompts</p>
        <AiPromptChips
          layout="wrap"
          onPick={onPickPrompt}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
