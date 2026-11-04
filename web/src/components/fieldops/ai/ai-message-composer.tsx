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
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onPickPrompt?: (prompt: string) => void;
  submitting?: boolean;
  disabled?: boolean;
  /** Compact chips above the input (empty chat or after welcome). */
  showPromptChips?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const trimmed = value.trim();
  const canSend = trimmed.length > 0 && !submitting && !disabled;

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
      className="border-t border-border bg-card px-3 py-3 md:px-4"
    >
      {showPromptChips && onPickPrompt ? (
        <div className="mx-auto mb-2.5 w-full max-w-3xl">
          <AiPromptChips
            layout="wrap"
            onPick={onPickPrompt}
            disabled={submitting || disabled}
          />
        </div>
      ) : null}
      <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
        <Textarea
          ref={ref}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about jobs, schedule, or access…"
          rows={1}
          disabled={submitting || disabled}
          aria-label="Message"
          className={cn(
            "min-h-11 max-h-40 flex-1 resize-none bg-background py-2.5 text-sm",
          )}
        />
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
      <p className="mx-auto mt-2 max-w-3xl text-[11px] text-muted-foreground">
        Enter to send · Shift+Enter for a new line
      </p>
    </form>
  );
}
