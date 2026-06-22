import type { PendingAttachment } from "./attachment-types";
import { buildAttachmentPromptBlocks } from "./prompt-context";

export type { PendingAttachment } from "./attachment-types";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".json",
  ".csv",
  ".log",
  ".xml",
  ".yaml",
  ".yml",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".pdf",
  ".zip"
]);

export function formatAttachmentSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const sizeKb = sizeBytes / 1024;
  if (sizeKb < 1024) {
    return `${sizeKb.toFixed(1)} KB`;
  }

  return `${(sizeKb / 1024).toFixed(1)} MB`;
}

export function isSupportedAttachmentName(fileName: string): boolean {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot < 0) {
    return false;
  }

  const extension = fileName.slice(lastDot).toLowerCase();
  return ALLOWED_EXTENSIONS.has(extension);
}

export function buildAttachmentPromptPrefix(attachments: PendingAttachment[]): string {
  return buildAttachmentPromptBlocks(attachments).join("\n\n");
}

export function removeAttachmentById(
  attachments: PendingAttachment[],
  attachmentId: string
): PendingAttachment[] {
  return attachments.filter((attachment) => attachment.attachmentId !== attachmentId);
}

export function createPastedImageFileName(date = new Date()): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `pasted-image-${year}${month}${day}-${hours}${minutes}${seconds}.png`;
}

export const createPastedImageName = createPastedImageFileName;
