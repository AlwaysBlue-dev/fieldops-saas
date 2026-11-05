export type AiChoiceOption = {
  label: string;
  send: string;
};

const CHOICES_FENCE_RE =
  /```fieldkeel-choices\s*([\s\S]*?)```/i;

/**
 * Extract clickable pick options the model embeds for ambiguous entity selection.
 * The fenced block is stripped from display text so users never see raw JSON.
 */
export function extractAiChoices(content: string): {
  displayContent: string;
  choices: AiChoiceOption[];
} {
  const match = content.match(CHOICES_FENCE_RE);
  if (!match) {
    return { displayContent: content.trim(), choices: [] };
  }

  const displayContent = content.replace(CHOICES_FENCE_RE, "").trim();
  let choices: AiChoiceOption[] = [];

  try {
    const parsed = JSON.parse(match[1]!.trim()) as unknown;
    if (Array.isArray(parsed)) {
      choices = parsed
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const row = entry as Record<string, unknown>;
          const label =
            typeof row.label === "string" ? row.label.trim() : "";
          const send =
            typeof row.send === "string"
              ? row.send.trim()
              : typeof row.prompt === "string"
                ? row.prompt.trim()
                : "";
          if (!label || !send) return null;
          return { label: label.slice(0, 160), send: send.slice(0, 500) };
        })
        .filter((entry): entry is AiChoiceOption => entry !== null)
        .slice(0, 12);
    }
  } catch {
    choices = [];
  }

  return { displayContent, choices };
}
