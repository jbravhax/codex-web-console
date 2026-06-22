import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Express } from "express";
import yauzl from "yauzl";
import { validateRepoPath } from "./repo-paths.js";
import {
  codexWebRelativePath,
  createUniqueDirectory,
  createUniquePath,
  ensureCodexWebGitignoreEntry,
  formatFileTimestamp
} from "./storage.js";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ZIP_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_EXTRACTED_FILE_COUNT = 2_000;
export const MAX_TOTAL_EXTRACTED_BYTES = 100 * 1024 * 1024;
export const MAX_SINGLE_EXTRACTED_FILE_BYTES = 25 * 1024 * 1024;

const SUPPORTED_REVIEW_EXTENSIONS = new Set([
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
  ".pdf"
]);

type AttachmentInput = {
  repoPath: string;
  file: Pick<Express.Multer.File, "originalname" | "mimetype" | "size" | "buffer">;
  overrideFileName?: string;
};

type ZipExtractionLimits = {
  maxZipUploadBytes: number;
  maxExtractedFileCount: number;
  maxTotalExtractedBytes: number;
  maxSingleExtractedFileBytes: number;
};

type ZipMetadata = {
  originalFileName: string;
  uploadedZipRelativePath: string;
  extractedRelativePath: string;
  extractedFileCount: number;
  skippedFileCount: number;
  skippedFiles: string[];
  totalExtractedBytes: number;
  createdAt: string;
  limitsApplied: ZipExtractionLimits;
};

export type SavedAttachment = {
  kind: "file";
  attachmentId: string;
  fileName: string;
  originalName: string;
  relativePath: string;
  absolutePath: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type SavedZipAttachment = {
  kind: "zip";
  attachmentId: string;
  fileName: string;
  originalName: string;
  relativePath: string;
  absolutePath: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  extractedFolderRelativePath: string;
  extractedFolderAbsolutePath: string;
  extractedFileCount: number;
  skippedFileCount: number;
  skippedFiles: string[];
  totalExtractedBytes: number;
  metadataRelativePath: string;
  metadataAbsolutePath: string;
};

export type SavedAnyAttachment = SavedAttachment | SavedZipAttachment;

const ZIP_LIMITS: ZipExtractionLimits = {
  maxZipUploadBytes: MAX_ZIP_UPLOAD_BYTES,
  maxExtractedFileCount: MAX_EXTRACTED_FILE_COUNT,
  maxTotalExtractedBytes: MAX_TOTAL_EXTRACTED_BYTES,
  maxSingleExtractedFileBytes: MAX_SINGLE_EXTRACTED_FILE_BYTES
};

function createAttachmentId(): string {
  return `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function sanitizeFileName(inputName: string): string {
  const lastSegment = inputName.split(/[\\/]/).at(-1) ?? inputName;
  const baseName = lastSegment.replace(/[<>:"/\\|?*\x00-\x1F]/g, "-");
  const collapsed = baseName.replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^\.+/, "");
  const fallback = collapsed || "attachment";
  return fallback.slice(0, 120);
}

function ensureAllowedReviewExtension(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  if (!SUPPORTED_REVIEW_EXTENSIONS.has(extension)) {
    throw new Error(
      "Unsupported file type. Allowed types: .txt, .md, .json, .csv, .log, .xml, .yaml, .yml, .png, .jpg, .jpeg, .webp, .pdf, .zip."
    );
  }

  return extension;
}

function isZipFileName(fileName: string): boolean {
  return path.extname(fileName).toLowerCase() === ".zip";
}

export function ensureSafeZipEntryName(entryName: string): void {
  if (entryName.startsWith("/") || entryName.startsWith("\\")) {
    throw new Error("ZIP contains an absolute path entry, which is not allowed.");
  }

  if (/^[A-Za-z]:[\\/]/.test(entryName)) {
    throw new Error("ZIP contains an absolute path entry, which is not allowed.");
  }

  const normalized = path.posix.normalize(entryName);
  const segments = normalized.split("/");
  if (segments.includes("..") || normalized.startsWith("../")) {
    throw new Error("ZIP contains a path traversal entry, which is not allowed.");
  }
}

function isDirectoryEntry(entryName: string): boolean {
  return entryName.endsWith("/");
}

function isSymlinkEntry(entry: yauzl.Entry): boolean {
  const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
  return mode === 0o120000;
}

function supportedExtractedFile(fileName: string): boolean {
  const extension = path.extname(fileName).toLowerCase();
  return SUPPORTED_REVIEW_EXTENSIONS.has(extension);
}

function streamFromZipEntry(zipFile: yauzl.ZipFile, entry: yauzl.Entry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error("Could not read ZIP entry."));
        return;
      }

      resolve(stream);
    });
  });
}

async function extractZipContents(
  zipBuffer: Buffer,
  extractedRootAbsolutePath: string,
  uploadedZipRelativePath: string,
  originalFileName: string
): Promise<{
  extractedFileCount: number;
  skippedFileCount: number;
  skippedFiles: string[];
  totalExtractedBytes: number;
  metadataRelativePath: string;
  metadataAbsolutePath: string;
}> {
  const zipFile = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(zipBuffer, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true }, (error, file) => {
      if (error || !file) {
        reject(error ?? new Error("Could not read ZIP archive."));
        return;
      }

      resolve(file);
    });
  });

  const skippedFiles: string[] = [];
  let extractedFileCount = 0;
  let totalExtractedBytes = 0;
  const createdAt = new Date().toISOString();

  await new Promise<void>((resolve, reject) => {
    let finished = false;

    const done = (error?: Error) => {
      if (finished) {
        return;
      }

      finished = true;
      zipFile.close();
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    zipFile.on("error", (error) => done(error));

    zipFile.readEntry();
    zipFile.on("entry", async (entry) => {
      try {
        ensureSafeZipEntryName(entry.fileName);

        if (isSymlinkEntry(entry)) {
          throw new Error("ZIP contains a symlink entry, which is not allowed.");
        }

        if (isDirectoryEntry(entry.fileName)) {
          zipFile.readEntry();
          return;
        }

        if (!supportedExtractedFile(entry.fileName)) {
          skippedFiles.push(entry.fileName);
          zipFile.readEntry();
          return;
        }

        if (entry.uncompressedSize > MAX_SINGLE_EXTRACTED_FILE_BYTES) {
          throw new Error("ZIP contains a file larger than the 25MB extracted-file limit.");
        }

        if (extractedFileCount + 1 > MAX_EXTRACTED_FILE_COUNT) {
          throw new Error("ZIP contains too many extractable files. The current limit is 2,000.");
        }

        if (totalExtractedBytes + entry.uncompressedSize > MAX_TOTAL_EXTRACTED_BYTES) {
          throw new Error("ZIP contents exceed the 100MB total extracted size limit.");
        }

        const normalizedEntry = path.posix.normalize(entry.fileName);
        const destinationPath = path.join(extractedRootAbsolutePath, ...normalizedEntry.split("/"));
        const relativeToRoot = path.relative(extractedRootAbsolutePath, destinationPath);
        if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
          throw new Error("ZIP contains a path traversal entry, which is not allowed.");
        }

        fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
        const stream = await streamFromZipEntry(zipFile, entry);
        await pipeline(stream, fs.createWriteStream(destinationPath));

        extractedFileCount += 1;
        totalExtractedBytes += entry.uncompressedSize;
        zipFile.readEntry();
      } catch (error) {
        done(error instanceof Error ? error : new Error("Could not safely extract ZIP archive."));
      }
    });

    zipFile.on("end", () => done());
  });

  const metadataRelativePath = path.posix.join(
    path.posix.dirname(uploadedZipRelativePath).replace("/zips", "/extracted"),
    path.posix.basename(extractedRootAbsolutePath),
    "extraction-metadata.json"
  );
  const metadataAbsolutePath = path.join(extractedRootAbsolutePath, "extraction-metadata.json");

  const metadata: ZipMetadata = {
    originalFileName,
    uploadedZipRelativePath,
    extractedRelativePath: path.posix.dirname(metadataRelativePath),
    extractedFileCount,
    skippedFileCount: skippedFiles.length,
    skippedFiles,
    totalExtractedBytes,
    createdAt,
    limitsApplied: ZIP_LIMITS
  };

  writeJson(metadataAbsolutePath, metadata);

  return {
    extractedFileCount,
    skippedFileCount: skippedFiles.length,
    skippedFiles,
    totalExtractedBytes,
    metadataRelativePath,
    metadataAbsolutePath
  };
}

export function saveAttachment(input: AttachmentInput): SavedAttachment {
  const repoPath = validateRepoPath(input.repoPath);
  const originalName = path.basename(input.file.originalname || "attachment");
  const requestedName = input.overrideFileName ?? originalName;
  const sanitizedName = sanitizeFileName(requestedName);
  ensureAllowedReviewExtension(sanitizedName);

  if (input.file.size <= 0) {
    throw new Error("Attachment is empty.");
  }

  if (input.file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("Attachment is too large. The current limit is 10MB.");
  }

  const attachmentsDir = path.join(repoPath, ".codex-web", "attachments", "files");
  fs.mkdirSync(attachmentsDir, { recursive: true });
  ensureCodexWebGitignoreEntry(repoPath);

  const filePath = createUniquePath(path.join(attachmentsDir, sanitizedName));
  const fileName = path.basename(filePath);
  const relativePath = codexWebRelativePath("attachments", "files", fileName);
  const attachmentId = createAttachmentId();
  const createdAt = new Date().toISOString();

  fs.writeFileSync(filePath, input.file.buffer);

  return {
    kind: "file",
    attachmentId,
    fileName,
    originalName,
    relativePath,
    absolutePath: filePath,
    mimeType: input.file.mimetype || "application/octet-stream",
    sizeBytes: input.file.size,
    createdAt
  };
}

export async function saveUploadedAttachment(input: AttachmentInput): Promise<SavedAnyAttachment> {
  const requestedName = input.overrideFileName ?? input.file.originalname;
  const sanitizedName = sanitizeFileName(requestedName);

  if (isZipFileName(sanitizedName)) {
    return saveZipAttachment(input);
  }

  return saveAttachment(input);
}

export async function saveZipAttachment(input: AttachmentInput): Promise<SavedZipAttachment> {
  const repoPath = validateRepoPath(input.repoPath);
  const originalName = path.basename(input.file.originalname || "attachment.zip");
  const requestedName = input.overrideFileName ?? originalName;
  const sanitizedName = sanitizeFileName(requestedName);

  if (!isZipFileName(sanitizedName)) {
    throw new Error("ZIP attachment must use a .zip file name.");
  }

  if (input.file.size <= 0) {
    throw new Error("Attachment is empty.");
  }

  if (input.file.size > MAX_ZIP_UPLOAD_BYTES) {
    throw new Error("ZIP attachment is too large. The current limit is 50MB.");
  }

  ensureCodexWebGitignoreEntry(repoPath);

  const zipDir = path.join(repoPath, ".codex-web", "attachments", "zips");
  const extractedBaseDir = path.join(repoPath, ".codex-web", "attachments", "extracted");
  fs.mkdirSync(zipDir, { recursive: true });
  fs.mkdirSync(extractedBaseDir, { recursive: true });

  const zipAbsolutePath = createUniquePath(path.join(zipDir, sanitizedName));
  const zipFileName = path.basename(zipAbsolutePath);
  const attachmentId = createAttachmentId();
  const createdAt = new Date().toISOString();
  const zipRelativePath = codexWebRelativePath("attachments", "zips", zipFileName);

  const safeZipFolderBase = sanitizeFileName(path.basename(zipFileName, ".zip")) || `zip-${formatFileTimestamp(new Date())}`;
  const extractedRootAbsolutePath = createUniqueDirectory(path.join(extractedBaseDir, safeZipFolderBase));
  fs.mkdirSync(extractedRootAbsolutePath, { recursive: true });

  try {
    const extraction = await extractZipContents(
      input.file.buffer,
      extractedRootAbsolutePath,
      zipRelativePath,
      originalName
    );

    fs.writeFileSync(zipAbsolutePath, input.file.buffer);

    return {
      kind: "zip",
      attachmentId,
      fileName: zipFileName,
      originalName,
      relativePath: zipRelativePath,
      absolutePath: zipAbsolutePath,
      mimeType: input.file.mimetype || "application/zip",
      sizeBytes: input.file.size,
      createdAt,
      extractedFolderRelativePath: codexWebRelativePath("attachments", "extracted", path.basename(extractedRootAbsolutePath)),
      extractedFolderAbsolutePath: extractedRootAbsolutePath,
      extractedFileCount: extraction.extractedFileCount,
      skippedFileCount: extraction.skippedFileCount,
      skippedFiles: extraction.skippedFiles,
      totalExtractedBytes: extraction.totalExtractedBytes,
      metadataRelativePath: extraction.metadataRelativePath,
      metadataAbsolutePath: extraction.metadataAbsolutePath
    };
  } catch (error) {
    fs.rmSync(extractedRootAbsolutePath, { recursive: true, force: true });
    throw error;
  }
}

export function createPastedImageFileName(): string {
  return `pasted-image-${formatFileTimestamp(new Date())}.png`;
}
