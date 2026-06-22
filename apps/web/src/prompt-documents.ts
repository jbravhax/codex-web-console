import { buildDocumentPromptBlocks } from "./prompt-context";

// 10,000 characters is the point where inline prompt editing starts to feel clumsy
// in this UI. Above that, saving to a local markdown document keeps the prompt box
// readable while still giving Codex the full context by reference.
export const LARGE_PASTE_CHAR_THRESHOLD = 10_000;
export const MAX_PASTE_BYTES = 1_000_000;

export type PasteHandling =
  | { kind: "small" }
  | { kind: "large" }
  | { kind: "too-large"; message: string };

export type SavedPromptDocument = {
  filePath: string;
  relativePath: string;
  charCount: number;
};

export function classifyPaste(content: string): PasteHandling {
  const byteCount = new TextEncoder().encode(content).length;
  if (byteCount > MAX_PASTE_BYTES) {
    return {
      kind: "too-large",
      message:
        "That paste is larger than 1MB. Split it into smaller pieces, attach an existing file instead, or upload a ZIP if this is a larger project bundle."
    };
  }

  if (content.length >= LARGE_PASTE_CHAR_THRESHOLD) {
    return { kind: "large" };
  }

  return { kind: "small" };
}

export function buildDocumentReference(relativePath: string): string {
  return `[saved context: ${relativePath}]`;
}

export function buildPromptWithDocumentContext(prompt: string, documents: SavedPromptDocument[]): string {
  const trimmedPrompt = prompt.trim();
  const references = buildDocumentPromptBlocks(documents);

  return [trimmedPrompt, ...references].filter(Boolean).join("\n\n");
}
