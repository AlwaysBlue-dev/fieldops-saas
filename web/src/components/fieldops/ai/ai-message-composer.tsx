import { AiPromptChips } from "./ai-prompt-chips";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import { Loader2, SendHorizontal } from "lucide-react";
import {
  useEffect,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from "react";

export function AiMessageComposer({
  value,
  onChange,
  onSubmit,
  onPickPrompt,
  submitting,
  disabled,
  showPromptChips,
  limitReached,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onPickPrompt?: (prompt: string) => void;
  submitting?: boolean;
  disabled?: boolean;
  /** Compact chips above the input (empty chat or after welcome). */
  showPromptChips?: boolean;
  /** Monthly AI task allowance exhausted. */
  limitReached?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const trimmed = value.trim();
  const blocked = Boolean(disabled || limitReached);
  const canSend = trimmed.length > 0 && !submitting && !blocked;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) onSubmit();
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (canSend) onSubmit();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="shrink-0 border-t border-border bg-card px-3 py-2.5 sm:px-4 sm:py-3"
    >
      {limitReached ? (
        <div
          className="mx-auto mb-2.5 w-full max-w-5xl rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-foreground"
          role="status"
        >
          Monthly AI task limit reached. New questions are blocked until next
          month (UTC) or a plan change. You can still read past conversations.
        </div>
      ) : null}
      {showPromptChips && onPickPrompt && !limitReached ? (
        <div className="mx-auto mb-2 hidden w-full max-w-5xl overflow-x-auto pb-0.5 sm:block [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <AiPromptChips
            layout="wrap"
            onPick={onPickPrompt}
            disabled={submitting || blocked}
          />
        </div>
      ) : null}
      <div className="mx-auto flex w-full max-w-5xl items-end gap-2">
        <div className="relative min-w-0 flex-1">
          <Textarea
            ref={ref}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              limitReached
                ? "Monthly AI limit reached…"
                : "Ask about jobs, clients, schedule…"
            }
            rows={1}
            disabled={submitting || blocked}
            aria-label="Message"
            className={cn(
              "min-h-11 max-h-40 w-full resize-none bg-background py-2.5 text-base shadow-none sm:text-[15px]",
              "focus-visible:border-primary/40",
            )}
          />
        </div>
        <Button
          type="submit"
          size="icon"
          className="size-11 shrink-0"
          disabled={!canSend}
          aria-label="Send message"
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <SendHorizontal className="size-4" />
          )}
        </Button>
      </div>
      <p className="mx-auto mt-1.5 hidden max-w-5xl text-[11px] text-muted-foreground sm:block">
        Enter to send · Shift+Enter for a new line
      </p>
    </form>
  );
}
