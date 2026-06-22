import fs from "node:fs";
import path from "node:path";

const PROJECT_HINT_FILES = [".git", "package.json", "pyproject.toml", "Cargo.toml", "README.md"];
const DANGEROUS_PATHS = new Set(["/", "/etc", "/bin", "/usr", "/var", "/root"]);

type ValidatePathOptions = {
  requireProjectHint: boolean;
};

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

  const hasProjectHint = PROJECT_HINT_FILES.some((entry) => fs.existsSync(path.join(resolvedPath, entry)));
  if (options.requireProjectHint && !hasProjectHint) {
    throw new Error(
      "That folder does not look like a project yet. Expected one of: .git, package.json, pyproject.toml, Cargo.toml, or README.md."
    );
  }

  return resolvedPath;
}

export function validateRepoPath(inputPath: string): string {
  return validateSafeDirectoryPath(inputPath, { requireProjectHint: true });
}

export function validateInspectableDirectoryPath(inputPath: string): string {
  return validateSafeDirectoryPath(inputPath, { requireProjectHint: false });
}
