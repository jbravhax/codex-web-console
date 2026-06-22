const BRACKETED_PASTE_START = "\u001b[200~";
const BRACKETED_PASTE_END = "\u001b[201~";

export type TerminalOutputState = "approval" | "awaiting-input" | "completed" | "working" | "idle";

function normalizePromptNewlines(prompt: string): string {
  return prompt.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function buildSubmittedPromptInput(prompt: string): string {
  const normalizedPrompt = normalizePromptNewlines(prompt);
  return `${BRACKETED_PASTE_START}${normalizedPrompt}${BRACKETED_PASTE_END}\r`;
}

export function detectTerminalOutputState(output: string): TerminalOutputState {
  const normalizedOutput = output.toLowerCase();

  if (
    normalizedOutput.includes("would you like to") ||
    normalizedOutput.includes("press enter to confirm") ||
    normalizedOutput.includes("esc to cancel") ||
    normalizedOutput.includes("retry without sandbox") ||
    normalizedOutput.includes("run the following command") ||
    normalizedOutput.includes("make the following edits") ||
    normalizedOutput.includes("allow reading") ||
    normalizedOutput.includes("allow ")
  ) {
    return "approval";
  }

  if (
    normalizedOutput.includes("run /review on my current changes") ||
    normalizedOutput.includes("run /") ||
    normalizedOutput.includes("what should codex do next") ||
    normalizedOutput.includes("waiting for your next instruction")
  ) {
    return "awaiting-input";
  }

  if (
    normalizedOutput.includes("worked for ") ||
    normalizedOutput.includes("exact contents:") ||
    normalizedOutput.includes("final git status:")
  ) {
    return "completed";
  }

  if (normalizedOutput.trim().length > 0) {
    return "working";
  }

  return "idle";
}
