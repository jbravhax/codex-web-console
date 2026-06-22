import fs from "node:fs";
import path from "node:path";
import { validateRepoPath } from "./repo-paths.js";
import {
  codexWebRelativePath,
  createUniqueMarkdownFileName,
  ensureCodexWebGitignoreEntry,
  formatFileTimestamp
} from "./storage.js";

export const LARGE_PASTE_CHAR_THRESHOLD = 10_000;
export const MAX_PASTE_BYTES = 1_000_000;

export type SavedDocument = {
  filePath: string;
  relativePath: string;
  charCount: number;
};

function buildDocumentContent(createdAt: string, charCount: number, content: string): string {
  return [
    "# Pasted Context",
    "",
    `- Created: ${createdAt}`,
    `- Original character count: ${charCount}`,
    "",
    "## Content",
    "",
    content,
    ""
  ].join("\n");
}

export function savePastedDocument(repoPathInput: string, content: string): SavedDocument {
  const repoPath = validateRepoPath(repoPathInput);
  const charCount = content.length;
  const byteCount = Buffer.byteLength(content, "utf8");

  if (charCount === 0) {
    throw new Error("Pasted content is empty.");
  }

  if (byteCount > MAX_PASTE_BYTES) {
    throw new Error("Pasted content is too large. The current limit is 1MB.");
  }

  const createdAt = new Date().toISOString();
  const codexWebDir = path.join(repoPath, ".codex-web");
  const documentsDir = path.join(codexWebDir, "documents");
  const baseName = `pasted-${formatFileTimestamp(new Date())}.md`;
  const fileName = createUniqueMarkdownFileName(documentsDir, baseName);
  const filePath = path.join(documentsDir, fileName);
  const relativePath = codexWebRelativePath("documents", fileName);

  fs.mkdirSync(documentsDir, { recursive: true });
  ensureCodexWebGitignoreEntry(repoPath);
  fs.writeFileSync(filePath, buildDocumentContent(createdAt, charCount, content), "utf8");

  return {
    filePath,
    relativePath,
    charCount
  };
}
