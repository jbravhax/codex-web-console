import { describe, expect, it } from "vitest";
import { buildSubmittedPromptInput, detectTerminalOutputState } from "./terminal-session";

describe("buildSubmittedPromptInput", () => {
  it("wraps prompt text in bracketed paste markers and submits with enter", () => {
    expect(buildSubmittedPromptInput("Hello Codex")).toBe("\u001b[200~Hello Codex\u001b[201~\r");
  });

  it("normalizes prompt newlines before wrapping the payload", () => {
    expect(buildSubmittedPromptInput("line 1\r\nline 2\rline 3")).toBe(
      "\u001b[200~line 1\nline 2\nline 3\u001b[201~\r"
    );
  });
});

describe("detectTerminalOutputState", () => {
  it("recognizes approval prompts", () => {
    expect(detectTerminalOutputState("Would you like to run the following command?\nPress enter to confirm")).toBe(
      "approval"
    );
  });

  it("recognizes active codex output", () => {
    expect(detectTerminalOutputState("Created only README.md.")).toBe("working");
  });
});
