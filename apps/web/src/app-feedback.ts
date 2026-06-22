import { CopyTextError, type CopyTextResult } from "./clipboard";
import type { PendingAttachment } from "./attachment-types";

export function toErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error ? error.message : fallbackMessage;
}

export function buildCopySuccessMessage(subject: string, result: CopyTextResult): string {
  if (result.method === "fallback") {
    return result.clipboardBlocked
      ? `Copied ${subject} using the browser fallback after direct clipboard access was blocked.`
      : `Copied ${subject} using the browser fallback.`;
  }

  return `Copied ${subject}.`;
}

export function buildCopyFailureMessage(subject: string, copyError: unknown): string {
  if (copyError instanceof CopyTextError) {
    if (copyError.code === "clipboard-blocked") {
      return `Direct clipboard access was blocked, and this browser does not offer a fallback copy path for ${subject}.`;
    }

    if (copyError.code === "fallback-unavailable") {
      return `Could not copy ${subject} because this browser does not offer a fallback copy path.`;
    }

    if (copyError.code === "copy-failed" && copyError.clipboardBlocked) {
      return `Direct clipboard access was blocked, and the browser fallback copy failed for ${subject}.`;
    }
  }

  return `Could not copy ${subject}.`;
}

export function buildLargePasteSavedMessage(relativePath: string, charCount: number): string {
  return `Saved ${charCount.toLocaleString()} characters to ${relativePath}. Large pastes at 10,000 characters or more become local context files, so Codex will receive this file reference instead of the full text inline.`;
}

export function buildAttachmentAddedMessage(relativePath: string, typeLabel = "file"): string {
  return `Added ${relativePath} to the next prompt as a ${typeLabel} reference. Paste short notes directly, attach standalone files for existing documents or images, and use ZIPs for larger repo or folder reviews.`;
}

export function buildZipUploadSuccessMessage(attachment: Extract<PendingAttachment, { kind: "zip" }>): string {
  const skippedSummary =
    attachment.skippedFileCount > 0
      ? ` ${attachment.skippedFileCount.toLocaleString()} file${attachment.skippedFileCount === 1 ? " was" : "s were"} skipped because ${attachment.skippedFileCount === 1 ? "it was" : "they were"} not reviewable here or would have been unsafe to extract.`
      : "";

  return `Uploaded ${attachment.fileName}. Accepted ${attachment.extractedFileCount.toLocaleString()} reviewable file${attachment.extractedFileCount === 1 ? "" : "s"} into ${attachment.extractedFolderRelativePath}/ for Codex to inspect.${skippedSummary} If this ZIP was meant to be a whole codebase review, focus Codex on the extracted folder path rather than the original archive.`;
}
