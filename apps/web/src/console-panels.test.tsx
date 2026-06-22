import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PendingContextPanel } from "./console-panels";
import { createGeneratedDocumentItem, createPendingContextFromAttachment } from "./pending-context";
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

const imageAttachment: PendingAttachment = {
  kind: "file",
  attachmentId: "attachment-image-1",
  fileName: "diagram.png",
  originalName: "diagram.png",
  relativePath: ".codex-web/attachments/files/diagram.png",
  absolutePath: "/tmp/diagram.png",
  mimeType: "image/png",
  sizeBytes: 4096,
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
  skippedFileCount: 2,
  skippedFiles: ["bin/tool.exe", "dist/output.bin"],
  skippedReasonCounts: {
    "unsupported-type": 2
  },
  extractedFiles: ["package.json", "src/index.ts", "README.md"],
  treePreview: ["- package.json", "- README.md", "  - src", "    - index.ts"],
  totalExtractedBytes: 1024,
  metadataRelativePath: ".codex-web/attachments/extracted/bundle/extraction-metadata.json",
  metadataAbsolutePath: "/tmp/bundle/extraction-metadata.json"
};

describe("PendingContextPanel", () => {
  it("groups mixed pending context and shows ZIP extraction details", () => {
    render(
      <PendingContextPanel
        pendingContextItems={[
          createGeneratedDocumentItem({
            filePath: "/tmp/context.md",
            relativePath: ".codex-web/documents/pasted-20260621-120000.md",
            charCount: 12000
          }),
          createPendingContextFromAttachment(fileAttachment),
          createPendingContextFromAttachment(imageAttachment),
          createPendingContextFromAttachment(zipAttachment)
        ]}
        readyPendingItemCount={4}
        pendingContextEmptyState="Start a session first."
        pendingContextPreviewLines={[
          "Saved pasted context: .codex-web/documents/pasted-20260621-120000.md",
          "Attached file: .codex-web/attachments/files/notes.md",
          "Attached file: .codex-web/attachments/files/diagram.png",
          "ZIP review: .codex-web/attachments/zips/bundle.zip (3 extracted, with skipped files)"
        ]}
        onClearAll={vi.fn()}
        onCopyRelativePath={vi.fn()}
        onRemoveAttachment={vi.fn()}
      />
    );

    expect(screen.getByText("Large pasted documents")).toBeTruthy();
    expect(screen.getByText("Uploaded files")).toBeTruthy();
    expect(screen.getByText("Pasted images")).toBeTruthy();
    expect(screen.getByText("ZIP uploads")).toBeTruthy();
    expect(screen.getByText("Extracted folder: .codex-web/attachments/extracted/bundle/")).toBeTruthy();
    expect(screen.getByText("Skipped reasons: 2 unsupported-type")).toBeTruthy();
    expect(screen.getByText("Warning: Some ZIP entries were skipped. 2 unsupported-type")).toBeTruthy();
  });

  it("fires clear-all from the grouped context panel", () => {
    const onClearAll = vi.fn();

    render(
      <PendingContextPanel
        pendingContextItems={[createPendingContextFromAttachment(fileAttachment)]}
        readyPendingItemCount={1}
        pendingContextEmptyState="Start a session first."
        pendingContextPreviewLines={["Attached file: .codex-web/attachments/files/notes.md"]}
        onClearAll={onClearAll}
        onCopyRelativePath={vi.fn()}
        onRemoveAttachment={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    expect(onClearAll).toHaveBeenCalledTimes(1);
  });
});
