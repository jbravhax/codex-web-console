import fs from "node:fs";
import path from "node:path";

const PROJECT_MARKERS = [
  ".git",
  "package.json",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "Cargo.toml",
  "pyproject.toml",
  "requirements.txt",
  "go.mod",
  "pom.xml",
  "build.gradle",
  ".github/workflows",
  "README.md"
] as const;
const DANGEROUS_PATHS = new Set(["/", "/etc", "/bin", "/usr", "/var", "/root"]);

type ValidatePathOptions = {
  requireProjectHint: boolean;
};

export type ProjectDirectoryKind =
  | "git-repository"
  | "source-project"
  | "broad-parent-folder"
  | "empty-folder"
  | "directory"
  | "file"
  | "missing"
  | "inaccessible";

export type ProjectDirectoryProfile = {
  kind: ProjectDirectoryKind;
  resolvedPath: string;
  markers: string[];
  childProjectCount: number;
  childDirectoryCount: number;
  isGitRepository: boolean;
  isEmpty: boolean;
};

function detectProjectMarkers(directoryPath: string): string[] {
  return PROJECT_MARKERS.filter((entry) => fs.existsSync(path.join(directoryPath, entry)));
}

function hasProjectHint(directoryPath: string): boolean {
  return detectProjectMarkers(directoryPath).length > 0;
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
  const currentMarkers = detectProjectMarkers(directoryPath);
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

  if (currentMarkers.length > 0) {
    return false;
  }

  return childProjectDirectories.length > 0 || childDirectories.length >= 3;
}

export function classifyProjectDirectory(inputPath: string): ProjectDirectoryProfile {
  const trimmedPath = inputPath.trim();
  const resolvedPath = path.resolve(trimmedPath || ".");

  if (!trimmedPath || !fs.existsSync(resolvedPath)) {
    return {
      kind: "missing",
      resolvedPath,
      markers: [],
      childProjectCount: 0,
      childDirectoryCount: 0,
      isGitRepository: false,
      isEmpty: false
    };
  }

  let stats: fs.Stats;
  try {
    stats = fs.statSync(resolvedPath);
  } catch {
    return {
      kind: "inaccessible",
      resolvedPath,
      markers: [],
      childProjectCount: 0,
      childDirectoryCount: 0,
      isGitRepository: false,
      isEmpty: false
    };
  }

  if (!stats.isDirectory()) {
    return {
      kind: "file",
      resolvedPath,
      markers: [],
      childProjectCount: 0,
      childDirectoryCount: 0,
      isGitRepository: false,
      isEmpty: false
    };
  }

  let childEntries: fs.Dirent[];
  try {
    childEntries = fs.readdirSync(resolvedPath, { withFileTypes: true });
  } catch {
    return {
      kind: "inaccessible",
      resolvedPath,
      markers: [],
      childProjectCount: 0,
      childDirectoryCount: 0,
      isGitRepository: false,
      isEmpty: false
    };
  }

  const markers = detectProjectMarkers(resolvedPath);
  const childDirectories = childEntries.filter((entry) => entry.isDirectory());
  const childProjectCount = childDirectories.filter((entry) => hasProjectHint(path.join(resolvedPath, entry.name))).length;
  const isGitRepository = markers.includes(".git");
  const isEmpty = childEntries.length === 0;

  let kind: ProjectDirectoryKind = "directory";
  if (isEmpty) {
    kind = "empty-folder";
  } else if (isGitRepository) {
    kind = "git-repository";
  } else if (markers.length > 0) {
    kind = "source-project";
  } else if (childProjectCount > 0 || childDirectories.length >= 3) {
    kind = "broad-parent-folder";
  }

  return {
    kind,
    resolvedPath,
    markers,
    childProjectCount,
    childDirectoryCount: childDirectories.length,
    isGitRepository,
    isEmpty
  };
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

  const profile = classifyProjectDirectory(trimmedPath);
  if (profile.kind === "inaccessible") {
    throw new Error(`Could not inspect the path: ${resolvedPath}`);
  }

  if (profile.kind === "file") {
    throw new Error(`The path is not a directory: ${resolvedPath}`);
  }

  if (options.requireProjectHint && (profile.kind === "directory" || profile.kind === "empty-folder" || profile.kind === "broad-parent-folder")) {
    if (profile.kind === "broad-parent-folder") {
      throw new Error(
        "That folder looks like a broad parent directory that contains multiple projects. Open one specific project folder inside it instead."
      );
    }

    if (profile.kind === "empty-folder") {
      throw new Error(
        "That folder is empty. Choose an existing project folder, or use Create new project here before starting Codex."
      );
    }

    throw new Error(
      "That folder does not look like a project yet. Start in a folder that already contains project files such as .git, package.json, pyproject.toml, Cargo.toml, go.mod, pom.xml, build.gradle, or README.md."
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
