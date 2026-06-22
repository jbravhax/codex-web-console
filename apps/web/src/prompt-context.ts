import type { PendingAttachment } from "./attachment-types";
import type { SavedPromptDocument } from "./prompt-documents";

export function buildSavedDocumentPromptLine(relativePath: string): string {
  return `Large pasted context was saved to: ${relativePath}. Please read that file and use it as context.`;
}

export function buildReviewFilesPromptBlock(relativePaths: string[]): string {
  return [
    "Attached files for review:",
    ...relativePaths.map((relativePath) => `- ${relativePath}`),
    "",
    "Please inspect these files as part of the task."
  ].join("\n");
}

export function buildZipPromptBlock(
  relativePath: string,
  extractedFolderRelativePath: string,
  extractedFileCount: number
): string {
  return [
    "Attached ZIP for review:",
    `- Original ZIP: ${relativePath}`,
    `- Extracted folder: ${extractedFolderRelativePath}/`,
    `- Extracted file count: ${extractedFileCount}`,
    "",
    "Please inspect the extracted folder as part of the task."
  ].join("\n");
}

export function buildAttachmentPromptBlocks(attachments: PendingAttachment[]): string[] {
  if (attachments.length === 0) {
    return [];
  }

  const regularAttachments = attachments.filter((attachment) => attachment.kind === "file");
  const zipAttachments = attachments.filter((attachment) => attachment.kind === "zip");
  const blocks: string[] = [];

  if (regularAttachments.length > 0) {
    blocks.push(buildReviewFilesPromptBlock(regularAttachments.map((attachment) => attachment.relativePath)));
  }

  blocks.push(
    ...zipAttachments.map((attachment) =>
      buildZipPromptBlock(attachment.relativePath, attachment.extractedFolderRelativePath, attachment.extractedFileCount)
    )
  );

  return blocks;
}

export function buildDocumentPromptBlocks(documents: SavedPromptDocument[]): string[] {
  return documents.map((document) => buildSavedDocumentPromptLine(document.relativePath));
}
