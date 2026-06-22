type AttachmentBase = {
  attachmentId: string;
  fileName: string;
  originalName: string;
  relativePath: string;
  absolutePath: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type PendingAttachment =
  | (AttachmentBase & {
      kind: "file";
    })
  | (AttachmentBase & {
      kind: "zip";
      extractedFolderRelativePath: string;
      extractedFolderAbsolutePath: string;
      extractedFileCount: number;
      skippedFileCount: number;
      skippedFiles: string[];
      totalExtractedBytes: number;
      metadataRelativePath: string;
      metadataAbsolutePath: string;
    });
