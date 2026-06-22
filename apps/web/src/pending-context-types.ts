export type PendingContextKind = "file" | "image" | "zip" | "generated-document";

export type PendingContextItem = {
  id: string;
  kind: PendingContextKind;
  name: string;
  typeLabel: string;
  icon: string;
  sizeBytes: number;
  relativePath: string;
  absolutePath: string;
  uploadState: "uploading" | "ready";
  progressPercent: number | null;
  detailLine: string;
  warningText?: string;
  extractedFolderRelativePath?: string;
  extractedFileCount?: number;
  skippedReasonCounts?: Record<string, number>;
  treePreview?: string[];
  promptLines: string[];
};
