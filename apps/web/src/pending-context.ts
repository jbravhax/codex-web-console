import type { SavedPromptDocument } from "./prompt-documents";
import type { PendingAttachment } from "./attachment-types";
import { buildSavedDocumentPromptLine, buildZipPromptBlock, buildReviewFilesPromptBlock } from "./prompt-context";
import type { PendingContextItem, PendingContextKind } from "./pending-context-types";
import { copyTextWithFallback } from "./clipboard";

export type { PendingContextItem, PendingContextKind } from "./pending-context-types";
export type PromptPreviewSection = {
  label: string;
  lines: string[];
};

function formatZipSkipReason(reason: string): string {
  switch (reason) {
    case "unsupported-type":
      return "unsupported or non-review file types";
    default:
      return reason.replace(/-/g, " ");
  }
}

function formatZipExtractedSummary(extractedFileCount: number, skippedFileCount: number, totalExtractedBytes: number): string {
  const extractedLabel = `${extractedFileCount.toLocaleString()} reviewable file${extractedFileCount === 1 ? "" : "s"} extracted`;
  const skippedLabel = `${skippedFileCount.toLocaleString()} skipped`;
  const sizeLabel = `${totalExtractedBytes.toLocaleString()} bytes total`;
  return `${extractedLabel}, ${skippedLabel}, ${sizeLabel}`;
}

function formatZipSkipSummary(skipReasonCounts: Record<string, number>): string {
  return Object.entries(skipReasonCounts)
    .map(([reason, count]) => `${count} ${formatZipSkipReason(reason)}`)
    .join(", ");
}

function inferAttachmentKind(attachment: PendingAttachment): PendingContextKind {
  if (attachment.kind === "zip") {
    return "zip";
  }

  if (attachment.mimeType.startsWith("image/")) {
    return "image";
  }

  return "file";
}

function describeAttachment(attachment: PendingAttachment): Omit<PendingContextItem, "uploadState" | "progressPercent"> {
  if (attachment.kind === "zip") {
    const skipSummary = formatZipSkipSummary(attachment.skippedReasonCounts);

    return {
      id: attachment.attachmentId,
      kind: "zip",
      name: attachment.fileName,
      typeLabel: "ZIP archive",
      icon: "[ZIP]",
      sizeBytes: attachment.sizeBytes,
      relativePath: attachment.relativePath,
      absolutePath: attachment.absolutePath,
      extractedFolderRelativePath: attachment.extractedFolderRelativePath,
      extractedFileCount: attachment.extractedFileCount,
      skippedReasonCounts: attachment.skippedReasonCounts,
      treePreview: attachment.treePreview,
      detailLine: formatZipExtractedSummary(
        attachment.extractedFileCount,
        attachment.skippedFileCount,
        attachment.totalExtractedBytes
      ),
      warningText:
        attachment.skippedFileCount > 0
          ? `Some ZIP entries were skipped because they are not reviewable here or would be unsafe to extract. ${skipSummary || "See extraction summary for details."}`
          : undefined,
      promptLines: [
        buildZipPromptBlock(
          attachment.relativePath,
          attachment.extractedFolderRelativePath,
          attachment.extractedFileCount
        )
      ]
    };
  }

  const kind = inferAttachmentKind(attachment);
  return {
    id: attachment.attachmentId,
    kind,
    name: attachment.fileName,
    typeLabel: kind === "image" ? "Image" : "File",
    icon: kind === "image" ? "[IMG]" : "[FILE]",
    sizeBytes: attachment.sizeBytes,
    relativePath: attachment.relativePath,
    absolutePath: attachment.absolutePath,
    detailLine: attachment.mimeType,
    promptLines: []
  };
}

export function createPendingAttachmentItem(attachment: PendingAttachment): PendingContextItem {
  return {
    ...describeAttachment(attachment),
    uploadState: "ready",
    progressPercent: null
  };
}

export function appendPendingContextItem(
  items: PendingContextItem[],
  nextItem: PendingContextItem
): PendingContextItem[] {
  return [...items, nextItem];
}

export function createUploadingContextItem(id: string, fileName: string, kind: PendingContextKind): PendingContextItem {
  const icon = kind === "zip" ? "[ZIP]" : kind === "image" ? "[IMG]" : "[FILE]";
  const typeLabel = kind === "zip" ? "ZIP archive" : kind === "image" ? "Image" : "File";

  return {
    id,
    kind,
    name: fileName,
    typeLabel,
    icon,
    sizeBytes: 0,
    relativePath: "",
    absolutePath: "",
    uploadState: "uploading",
    progressPercent: 0,
    detailLine: "Uploading...",
    promptLines: []
  };
}

export function updateUploadingProgress(
  items: PendingContextItem[],
  id: string,
  progressPercent: number
): PendingContextItem[] {
  return items.map((item) =>
    item.id === id
      ? {
          ...item,
          progressPercent
        }
      : item
  );
}

export function replaceUploadingItem(
  items: PendingContextItem[],
  id: string,
  nextItem: PendingContextItem
): PendingContextItem[] {
  return items.map((item) => (item.id === id ? nextItem : item));
}

export function removePendingContextById(items: PendingContextItem[], id: string): PendingContextItem[] {
  return items.filter((item) => item.id !== id);
}

export function clearPendingContext(): PendingContextItem[] {
  return [];
}

export function countReadyPendingContextItems(items: PendingContextItem[]): number {
  return items.filter((item) => item.uploadState === "ready").length;
}

export function buildPendingContextPreview(items: PendingContextItem[]): string[] {
  const readyItems = items.filter((item) => item.uploadState === "ready");
  const previewLines: string[] = [];

  for (const item of readyItems) {
    if (item.kind === "zip") {
      previewLines.push(
        `ZIP review: ${item.relativePath} (${(item.extractedFileCount ?? 0).toLocaleString()} reviewable files extracted${item.warningText ? ", with skipped files" : ""})`
      );
      continue;
    }

    if (item.kind === "generated-document") {
      previewLines.push(`Saved pasted context: ${item.relativePath}`);
      continue;
    }

    previewLines.push(`Attached file: ${item.relativePath}`);
  }

  return previewLines;
}

export function createGeneratedDocumentItem(document: SavedPromptDocument): PendingContextItem {
  const pathSegments = document.relativePath.split("/");
  const fileName = pathSegments[pathSegments.length - 1] || document.relativePath;

  return {
    id: document.relativePath,
    kind: "generated-document",
    name: fileName,
    typeLabel: "Generated document",
    icon: "[DOC]",
    sizeBytes: document.charCount,
    relativePath: document.relativePath,
    absolutePath: document.filePath,
    uploadState: "ready",
    progressPercent: null,
    detailLine: `${document.charCount.toLocaleString()} characters`,
    promptLines: [buildSavedDocumentPromptLine(document.relativePath)]
  };
}

export function appendGeneratedDocumentItem(
  items: PendingContextItem[],
  document: SavedPromptDocument
): PendingContextItem[] {
  return appendPendingContextItem(items, createGeneratedDocumentItem(document));
}

export function buildPromptWithPendingContext(prompt: string, items: PendingContextItem[]): string {
  const readyItems = items.filter((item) => item.uploadState === "ready");
  const blocks = buildPromptBlocks(readyItems);
  const trimmedPrompt = prompt.trim();
  return [...blocks, trimmedPrompt].filter(Boolean).join("\n\n");
}

export function buildPromptPreviewSections(prompt: string, items: PendingContextItem[]): PromptPreviewSection[] {
  const readyItems = items.filter((item) => item.uploadState === "ready");
  const sections: PromptPreviewSection[] = [];
  const userPrompt = prompt.trim();
  const documents = readyItems.filter((item) => item.kind === "generated-document");
  const uploadedFiles = readyItems.filter((item) => item.kind === "file");
  const pastedImages = readyItems.filter((item) => item.kind === "image");
  const zipItems = readyItems.filter((item) => item.kind === "zip");

  if (!userPrompt && readyItems.length === 0) {
    return [];
  }

  sections.push({
    label: "User prompt text",
    lines: userPrompt ? [userPrompt] : ["No typed prompt yet."]
  });

  if (documents.length > 0) {
    sections.push({
      label: "Large pasted documents",
      lines: documents.flatMap((item) => item.promptLines)
    });
  }

  if (uploadedFiles.length > 0) {
    sections.push({
      label: "Uploaded files",
      lines: uploadedFiles.map((item) => item.relativePath)
    });
  }

  if (pastedImages.length > 0) {
    sections.push({
      label: "Pasted images",
      lines: pastedImages.map((item) => item.relativePath)
    });
  }

  if (zipItems.length > 0) {
    sections.push({
      label: "ZIP original paths",
      lines: zipItems.map((item) => item.relativePath)
    });
    sections.push({
      label: "ZIP extracted folder paths",
      lines: zipItems.map((item) => `${item.extractedFolderRelativePath ?? ""}/`)
    });
    sections.push({
      label: "ZIP extraction summary",
      lines: zipItems.map(
        (item) =>
          `${item.name}: ${(item.extractedFileCount ?? 0).toLocaleString()} reviewable files extracted, ${item.warningText ?? "no skipped files"}`
      )
    });
  }

  return sections;
}

export function buildPromptPreviewOutput(prompt: string, items: PendingContextItem[]): string {
  return buildPromptWithPendingContext(prompt, items);
}

export function copyRelativePath(relativePath: string) {
  return copyTextWithFallback(relativePath);
}

export function copyGeneratedPromptContext(text: string) {
  return copyTextWithFallback(text);
}

export function createPendingContextItemFromAttachment(attachment: PendingAttachment): PendingContextItem {
  return createPendingAttachmentItem(attachment);
}

export function appendPendingContextFromAttachment(
  items: PendingContextItem[],
  attachment: PendingAttachment
): PendingContextItem[] {
  return appendPendingContextItem(items, createPendingContextItemFromAttachment(attachment));
}

export const createPendingContextFromAttachment = createPendingContextItemFromAttachment;

function buildPromptBlocks(readyItems: PendingContextItem[]): string[] {
  const regularAttachments = readyItems.filter((item) => item.kind === "file" || item.kind === "image");
  const generatedDocuments = readyItems.filter((item) => item.kind === "generated-document");
  const zipItems = readyItems.filter((item) => item.kind === "zip");

  const blocks: string[] = [];
  if (regularAttachments.length > 0) {
    blocks.push(buildReviewFilesPromptBlock(regularAttachments.map((item) => item.relativePath)));
  }

  blocks.push(...zipItems.map((item) => item.promptLines.join("\n")));
  blocks.push(...generatedDocuments.map((item) => item.promptLines.join("\n")));
  return blocks;
}
