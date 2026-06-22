import { describe, expect, it } from "vitest";
import {
  buildAttachmentPromptPrefix,
  createPastedImageName,
  removeAttachmentById,
  type PendingAttachment
} from "./attachments";

const sampleAttachment: PendingAttachment = {
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

const sampleZipAttachment: PendingAttachment = {
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

describe("buildAttachmentPromptPrefix", () => {
  it("builds prompt context for pending attachments", () => {
    const prefix = buildAttachmentPromptPrefix([sampleAttachment]);
    expect(prefix).toContain("Attached files for review:");
    expect(prefix).toContain(".codex-web/attachments/files/notes.md");
    expect(prefix).toContain("Please inspect these files as part of the task.");
  });

  it("builds ZIP prompt context with original ZIP and extracted folder", () => {
    const prefix = buildAttachmentPromptPrefix([sampleZipAttachment]);
    expect(prefix).toContain("Attached ZIP for review:");
    expect(prefix).toContain("Original ZIP: .codex-web/attachments/zips/bundle.zip");
    expect(prefix).toContain("Extracted folder: .codex-web/attachments/extracted/bundle/");
    expect(prefix).toContain("Please inspect the extracted folder as part of the task.");
  });
});

describe("createPastedImageName", () => {
  it("creates the expected pasted image file name", () => {
    expect(createPastedImageName(new Date("2026-06-21T09:08:07.000Z"))).toBe("pasted-image-20260621-090807.png");
  });
});

describe("removeAttachmentById", () => {
  it("removes an attachment from prompt context without touching storage", () => {
    expect(removeAttachmentById([sampleAttachment], "attachment-1")).toEqual([]);
  });

  it("removes a ZIP attachment from prompt context", () => {
    expect(removeAttachmentById([sampleZipAttachment], "attachment-zip-1")).toEqual([]);
  });
});
