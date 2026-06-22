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
  promptLines: string[];
};
