import { describe, expect, it } from "vitest";
import {
  buildDocumentPromptBlocks,
  buildReviewFilesPromptBlock,
  buildSavedDocumentPromptLine,
  buildZipPromptBlock
} from "./prompt-context";

describe("prompt context helpers", () => {
  it("builds the regular file review block", () => {
    const block = buildReviewFilesPromptBlock([
      ".codex-web/attachments/files/notes.md",
      ".codex-web/attachments/files/spec.pdf"
    ]);

    expect(block).toContain("Attached files for review:");
    expect(block).toContain(".codex-web/attachments/files/notes.md");
    expect(block).toContain(".codex-web/attachments/files/spec.pdf");
  });

  it("builds the ZIP review block", () => {
    const block = buildZipPromptBlock(
      ".codex-web/attachments/zips/bundle.zip",
      ".codex-web/attachments/extracted/bundle",
      3
    );

    expect(block).toContain("Attached ZIP for review:");
    expect(block).toContain("Original ZIP: .codex-web/attachments/zips/bundle.zip");
    expect(block).toContain("Extracted folder: .codex-web/attachments/extracted/bundle/");
    expect(block).toContain("Extracted file count: 3");
  });

  it("builds saved document instructions", () => {
    const line = buildSavedDocumentPromptLine(".codex-web/documents/pasted-20260621-120000.md");
    const blocks = buildDocumentPromptBlocks([
      {
        filePath: "/tmp/context.md",
        relativePath: ".codex-web/documents/pasted-20260621-120000.md",
        charCount: 12000
      }
    ]);

    expect(line).toContain("Large pasted context was saved to");
    expect(blocks).toEqual([line]);
  });
});
