import { describe, expect, it } from "vitest";
import type { PendingAttachment } from "./attachment-types";
import { CopyTextError } from "./clipboard";
import {
  buildAttachmentAddedMessage,
  buildCopyFailureMessage,
  buildCopySuccessMessage,
  buildLargePasteSavedMessage,
  buildZipUploadSuccessMessage,
  toErrorMessage
} from "./app-feedback";

const zipAttachment: Extract<PendingAttachment, { kind: "zip" }> = {
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
  skippedFileCount: 2,
  skippedFiles: ["bin/tool.exe", "dist/output.bin"],
  skippedReasonCounts: {
    "unsupported-type": 2
  },
  extractedFiles: ["package.json", "src/index.ts", "README.md"],
  treePreview: ["- package.json"],
  totalExtractedBytes: 1024,
  metadataRelativePath: ".codex-web/attachments/extracted/bundle/extraction-metadata.json",
  metadataAbsolutePath: "/tmp/bundle/extraction-metadata.json"
};

describe("app feedback helpers", () => {
  it("normalizes error messages", () => {
    expect(toErrorMessage(new Error("specific"), "fallback")).toBe("specific");
    expect(toErrorMessage("other", "fallback")).toBe("fallback");
  });

  it("builds copy success messages for direct and fallback copy", () => {
    expect(buildCopySuccessMessage("the transcript", { method: "clipboard", clipboardBlocked: false })).toBe(
      "Copied the transcript."
    );
    expect(buildCopySuccessMessage("the transcript", { method: "fallback", clipboardBlocked: true })).toContain(
      "browser fallback"
    );
  });

  it("builds specific clipboard failure messages", () => {
    expect(
      buildCopyFailureMessage("the transcript", new CopyTextError("clipboard-blocked", true))
    ).toContain("does not offer a fallback copy path");
    expect(
      buildCopyFailureMessage("the transcript", new CopyTextError("copy-failed", true))
    ).toContain("fallback copy failed");
  });

  it("builds a human-readable ZIP upload success message", () => {
    expect(buildZipUploadSuccessMessage(zipAttachment)).toContain("Accepted 3 reviewable files");
    expect(buildZipUploadSuccessMessage(zipAttachment)).toContain("2 files were skipped");
    expect(buildZipUploadSuccessMessage(zipAttachment)).toContain("focus Codex on the extracted folder path");
  });

  it("explains when a ZIP uploads successfully but contains no reviewable extracted files", () => {
    expect(
      buildZipUploadSuccessMessage({
        ...zipAttachment,
        extractedFileCount: 0,
        extractedFiles: [],
        treePreview: [],
        skippedFileCount: 5
      })
    ).toContain("No reviewable files were extracted");
  });

  it("builds a large-paste success message with threshold guidance", () => {
    expect(buildLargePasteSavedMessage(".codex-web/documents/example.md", 12_345)).toContain("12,345 characters");
    expect(buildLargePasteSavedMessage(".codex-web/documents/example.md", 12_345)).toContain(
      "10,000 characters or more become local context files"
    );
  });

  it("builds attachment success guidance that explains when to paste, attach, or ZIP", () => {
    expect(buildAttachmentAddedMessage(".codex-web/attachments/files/notes.md")).toContain("Paste short notes directly");
    expect(buildAttachmentAddedMessage(".codex-web/attachments/files/notes.md")).toContain("use ZIPs for larger repo or folder reviews");
  });
});
