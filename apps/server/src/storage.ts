import fs from "node:fs";
import path from "node:path";

const CODEX_WEB_GITIGNORE_ENTRY = ".codex-web/";

export function ensureCodexWebGitignoreEntry(repoPath: string): void {
  const gitignorePath = path.join(repoPath, ".gitignore");

  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, `${CODEX_WEB_GITIGNORE_ENTRY}\n`, "utf8");
    return;
  }

  const current = fs.readFileSync(gitignorePath, "utf8");
  const lines = current.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes(CODEX_WEB_GITIGNORE_ENTRY)) {
    return;
  }

  const suffix = current.endsWith("\n") || current.length === 0 ? "" : "\n";
  fs.writeFileSync(gitignorePath, `${current}${suffix}${CODEX_WEB_GITIGNORE_ENTRY}\n`, "utf8");
}

export function formatFileTimestamp(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

export function createUniquePath(targetPath: string): string {
  if (!fs.existsSync(targetPath)) {
    return targetPath;
  }

  const extension = path.extname(targetPath);
  const stem = targetPath.slice(0, targetPath.length - extension.length);
  let counter = 1;

  while (true) {
    const candidate = `${stem}-${String(counter).padStart(2, "0")}${extension}`;
    if (!fs.existsSync(candidate)) {
      return candidate;
    }

    counter += 1;
  }
}

export function createUniqueDirectory(targetDir: string): string {
  if (!fs.existsSync(targetDir)) {
    return targetDir;
  }

  let counter = 1;
  while (true) {
    const candidate = `${targetDir}-${String(counter).padStart(2, "0")}`;
    if (!fs.existsSync(candidate)) {
      return candidate;
    }

    counter += 1;
  }
}

export function createUniqueMarkdownFileName(directoryPath: string, baseName: string): string {
  const firstPath = path.join(directoryPath, baseName);
  if (!fs.existsSync(firstPath)) {
    return baseName;
  }

  let counter = 1;
  while (true) {
    const candidate = baseName.replace(/\.md$/, `-${String(counter).padStart(2, "0")}.md`);
    if (!fs.existsSync(path.join(directoryPath, candidate))) {
      return candidate;
    }

    counter += 1;
  }
}

export function codexWebRelativePath(...segments: string[]): string {
  return path.posix.join(".codex-web", ...segments);
}
