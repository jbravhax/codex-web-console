import fs from "node:fs";
import path from "node:path";

const PROJECT_HINT_FILES = [".git", "package.json", "pyproject.toml", "Cargo.toml", "README.md"];
const DANGEROUS_PATHS = new Set(["/", "/etc", "/bin", "/usr", "/var", "/root"]);

type ValidatePathOptions = {
  requireProjectHint: boolean;
};

function hasProjectHint(directoryPath: string): boolean {
  return PROJECT_HINT_FILES.some((entry) => fs.existsSync(path.join(directoryPath, entry)));
}

function isInsideDangerousPath(normalizedPath: string): boolean {
  for (const dangerousPath of DANGEROUS_PATHS) {
    if (dangerousPath === "/") {
      continue;
    }

    if (normalizedPath === dangerousPath || normalizedPath.startsWith(`${dangerousPath}/`)) {
      return true;
    }
  }

  return false;
}

function looksLikeBroadParentDirectory(directoryPath: string): boolean {
  let childEntries: fs.Dirent[];

  try {
    childEntries = fs.readdirSync(directoryPath, { withFileTypes: true });
  } catch {
    return false;
  }

  const childDirectories = childEntries.filter((entry) => entry.isDirectory());
  if (childDirectories.length === 0) {
    return false;
  }

  const childProjectDirectories = childDirectories.filter((entry) => hasProjectHint(path.join(directoryPath, entry.name)));

  return childProjectDirectories.length > 0 || childDirectories.length >= 3;
}

function validateSafeDirectoryPath(inputPath: string, options: ValidatePathOptions): string {
  const trimmedPath = inputPath.trim();
  if (!trimmedPath) {
    throw new Error("Enter a repo path before starting Codex.");
  }

  const resolvedPath = path.resolve(trimmedPath);
  const normalizedPath = path.posix.normalize(resolvedPath);

  if (DANGEROUS_PATHS.has(normalizedPath)) {
    throw new Error(`Refusing to start Codex in ${normalizedPath}. Choose a project folder instead.`);
  }

  if (normalizedPath === "/home") {
    throw new Error("Use a specific folder inside /home, not /home itself.");
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`The path does not exist: ${resolvedPath}`);
  }

  let stats: fs.Stats;
  try {
    stats = fs.statSync(resolvedPath);
  } catch {
    throw new Error(`Could not inspect the path: ${resolvedPath}`);
  }

  if (!stats.isDirectory()) {
    throw new Error(`The path is not a directory: ${resolvedPath}`);
  }

  const directoryHasProjectHint = hasProjectHint(resolvedPath);
  if (options.requireProjectHint && !directoryHasProjectHint) {
    if (looksLikeBroadParentDirectory(resolvedPath)) {
      throw new Error(
        "That folder looks like a broad parent directory that contains multiple projects. Open one specific project folder inside it instead."
      );
    }

    throw new Error(
      "That folder does not look like a project yet. Start in a folder that already contains project files such as .git, README.md, package.json, pyproject.toml, or Cargo.toml."
    );
  }

  return resolvedPath;
}

export function validateNewProjectPath(inputPath: string): string {
  const trimmedPath = inputPath.trim();
  if (!trimmedPath) {
    throw new Error("Enter a project path before creating a folder.");
  }

  const resolvedPath = path.resolve(trimmedPath);
  const normalizedPath = path.posix.normalize(resolvedPath);

  if (DANGEROUS_PATHS.has(normalizedPath) || isInsideDangerousPath(normalizedPath)) {
    throw new Error(`Refusing to create a project in ${normalizedPath}. Choose a folder inside your own workspace instead.`);
  }

  if (normalizedPath === "/home") {
    throw new Error("Use a specific folder inside /home, not /home itself.");
  }

  if (fs.existsSync(resolvedPath)) {
    let stats: fs.Stats;
    try {
      stats = fs.statSync(resolvedPath);
    } catch {
      throw new Error(`Could not inspect the path: ${resolvedPath}`);
    }

    if (!stats.isDirectory()) {
      throw new Error(`The path already exists as a file: ${resolvedPath}. Choose a folder path instead.`);
    }

    const existingEntries = fs.readdirSync(resolvedPath);
    if (existingEntries.length > 0) {
      if (looksLikeBroadParentDirectory(resolvedPath)) {
        throw new Error(
          "That folder already exists and looks like a broad parent directory containing other projects. Choose one specific new folder inside it instead."
        );
      }

      throw new Error("That folder already exists and is not empty. Choose a new folder path instead so existing data is not overwritten.");
    }

    return resolvedPath;
  }

  const parentPath = path.dirname(resolvedPath);
  if (!fs.existsSync(parentPath)) {
    throw new Error(`The parent folder does not exist: ${parentPath}. Choose an existing parent folder first.`);
  }

  let parentStats: fs.Stats;
  try {
    parentStats = fs.statSync(parentPath);
  } catch {
    throw new Error(`Could not inspect the parent folder: ${parentPath}`);
  }

  if (!parentStats.isDirectory()) {
    throw new Error(`The parent path is not a directory: ${parentPath}`);
  }

  return resolvedPath;
}

export function validateRepoPath(inputPath: string): string {
  return validateSafeDirectoryPath(inputPath, { requireProjectHint: true });
}

export function validateInspectableDirectoryPath(inputPath: string): string {
  return validateSafeDirectoryPath(inputPath, { requireProjectHint: false });
}
