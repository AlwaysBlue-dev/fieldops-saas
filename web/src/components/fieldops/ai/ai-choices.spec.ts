import { describe, expect, it } from "vitest";
import { extractAiChoices } from "./ai-choices";

describe("extractAiChoices", () => {
  it("strips the choices fence and returns tap options", () => {
    const raw = [
      "Which client should we use?",
      "",
      "```fieldkeel-choices",
      '[{"label":"Emily · Active","send":"Use client Emily"},{"label":"Acme","send":"Use client Acme"}]',
      "```",
    ].join("\n");

    const result = extractAiChoices(raw);
    expect(result.displayContent).toBe("Which client should we use?");
    expect(result.choices).toEqual([
      { label: "Emily · Active", send: "Use client Emily" },
      { label: "Acme", send: "Use client Acme" },
    ]);
  });

  it("returns empty choices when fence is missing", () => {
    const result = extractAiChoices("No picks here.");
    expect(result.displayContent).toBe("No picks here.");
    expect(result.choices).toEqual([]);
  });
});
