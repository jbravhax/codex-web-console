import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPromptPreviewOutput,
  buildPromptPreviewSections,
  buildPendingContextPreview,
  buildPromptWithPendingContext,
  clearPendingContext,
  countReadyPendingContextItems,
  copyGeneratedPromptContext,
  copyRelativePath,
  createGeneratedDocumentItem,
  createPendingContextFromAttachment,
  type PendingContextItem
} from "./pending-context";
import type { PendingAttachment } from "./attachments";

const fileAttachment: PendingAttachment = {
  kind: "file",
  attachmentId: "attachment-1",
  fileName: "notes.md",
  originalName: "notes.md",
  relativePath: ".codex-web/attachments/files/notes.md",
  absolutePath: "/tmp/notes.md",
  mimeType: "text/markdown",
  sizeBytes: 128,
  createdAt: "2026-06-21T12:00:00.000Z"
};

const zipAttachment: PendingAttachment = {
  kind: "zip",
  attachmentId: "attachment-zip-1",
  fileName: "bundle.zip",
  originalName: "bundle.zip",
  relativePath: ".codex-web/attachments/zips/bundle.zip",
  absolutePath: "/tmp/bundle.zip",
  mimeType: "application/zip",
  sizeBytes: 4096,
  createdAt: "2026-06-21T12:00:00.000Z",
  extractedFolderRelativePath: ".codex-web/attachments/extracted/bundle",
  extractedFolderAbsolutePath: "/tmp/bundle",
  extractedFileCount: 3,
  skippedFileCount: 1,
  skippedFiles: ["bin/tool.exe"],
  totalExtractedBytes: 1024,
  metadataRelativePath: ".codex-web/attachments/extracted/bundle/extraction-metadata.json",
  metadataAbsolutePath: "/tmp/bundle/extraction-metadata.json"
};

beforeEach(() => {
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined)
    }
  });
});

describe("pending context model", () => {
  it("supports mixed pending context and prompt generation", () => {
    const generatedDocument = createGeneratedDocumentItem({
      filePath: "/tmp/context.md",
      relativePath: ".codex-web/documents/pasted-20260621-120000.md",
      charCount: 12000
    });

    const prompt = buildPromptWithPendingContext("Please review this", [
      createPendingContextFromAttachment(fileAttachment),
      createPendingContextFromAttachment(zipAttachment),
      generatedDocument
    ]);

    expect(prompt).toContain("Attached files for review:");
    expect(prompt).toContain(".codex-web/attachments/files/notes.md");
    expect(prompt).toContain("Attached ZIP for review:");
    expect(prompt).toContain(".codex-web/attachments/extracted/bundle/");
    expect(prompt).toContain("Large pasted context was saved to: .codex-web/documents/pasted-20260621-120000.md");
    expect(prompt).toContain("Please review this");
  });

  it("clears all pending context", () => {
    const items: PendingContextItem[] = [createPendingContextFromAttachment(fileAttachment)];
    expect(clearPendingContext()).toEqual([]);
    expect(items).toHaveLength(1);
  });

  it("copies a relative path", async () => {
    await copyRelativePath(".codex-web/attachments/files/notes.md");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(".codex-web/attachments/files/notes.md");
  });

  it("copies the generated prompt context", async () => {
    await copyGeneratedPromptContext("Attached files for review:\n- .codex-web/attachments/files/notes.md");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "Attached files for review:\n- .codex-web/attachments/files/notes.md"
    );
  });

  it("builds a readable pending-context preview", () => {
    const previewLines = buildPendingContextPreview([
      createPendingContextFromAttachment(fileAttachment),
      createPendingContextFromAttachment(zipAttachment),
      createGeneratedDocumentItem({
        filePath: "/tmp/context.md",
        relativePath: ".codex-web/documents/pasted-20260621-120000.md",
        charCount: 12000
      })
    ]);

    expect(previewLines).toContain("Attached file: .codex-web/attachments/files/notes.md");
    expect(previewLines).toContain("ZIP review: .codex-web/attachments/zips/bundle.zip");
    expect(previewLines).toContain("Saved pasted context: .codex-web/documents/pasted-20260621-120000.md");
  });

  it("counts only ready pending context items", () => {
    const readyItem = createPendingContextFromAttachment(fileAttachment);
    const uploadingItem: PendingContextItem = {
      ...readyItem,
      id: "uploading-1",
      uploadState: "uploading",
      progressPercent: 45
    };

    expect(countReadyPendingContextItems([readyItem, uploadingItem])).toBe(1);
  });

  it("builds preview sections that match the actual prompt output", () => {
    const generatedDocument = createGeneratedDocumentItem({
      filePath: "/tmp/context.md",
      relativePath: ".codex-web/documents/pasted-20260621-120000.md",
      charCount: 12000
    });
    const imageAttachment = createPendingContextFromAttachment({
      ...fileAttachment,
      attachmentId: "attachment-image-1",
      fileName: "diagram.png",
      originalName: "diagram.png",
      relativePath: ".codex-web/attachments/files/diagram.png",
      absolutePath: "/tmp/diagram.png",
      mimeType: "image/png"
    });
    const items = [
      createPendingContextFromAttachment(fileAttachment),
      imageAttachment,
      createPendingContextFromAttachment(zipAttachment),
      generatedDocument
    ];

    const previewSections = buildPromptPreviewSections("Please review this", items);
    const previewOutput = buildPromptPreviewOutput("Please review this", items);
    const actualOutput = buildPromptWithPendingContext("Please review this", items);

    expect(previewOutput).toBe(actualOutput);
    expect(previewSections).toEqual([
      {
        label: "User prompt text",
        lines: ["Please review this"]
      },
      {
        label: "Large pasted documents",
        lines: ["Large pasted context was saved to: .codex-web/documents/pasted-20260621-120000.md. Please read that file and use it as context."]
      },
      {
        label: "Uploaded files",
        lines: [".codex-web/attachments/files/notes.md"]
      },
      {
        label: "Pasted images",
        lines: [".codex-web/attachments/files/diagram.png"]
      },
      {
        label: "ZIP original paths",
        lines: [".codex-web/attachments/zips/bundle.zip"]
      },
      {
        label: "ZIP extracted folder paths",
        lines: [".codex-web/attachments/extracted/bundle/"]
      }
    ]);
  });
});
