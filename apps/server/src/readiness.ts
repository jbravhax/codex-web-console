import fs from "node:fs";
import path from "node:path";
import { classifyProjectDirectory, validateRepoPath } from "./repo-paths.js";
import type { AppConfig } from "./config.js";

export type ReadinessStatus = "passed" | "warning" | "failed";

export type ReadinessCheck = {
  key:
    | "codex-executable"
    | "git-executable"
    | "project-folder"
    | "project-access"
    | "bubblewrap"
    | "user-namespaces";
  status: ReadinessStatus;
  message: string;
  recommendedAction: string;
};

export type ReadinessSummary = {
  overallStatus: ReadinessStatus;
  canStart: boolean;
  checkedAt: string;
  repoPath: string;
  items: ReadinessCheck[];
};

type ReadinessDependencies = {
  accessSync(targetPath: string, mode?: number): void;
  existsSync(targetPath: string): boolean;
  platform: NodeJS.Platform;
  pathEnv: string;
  pathextEnv: string;
  readFileSync(targetPath: string, encoding: BufferEncoding): string;
  validateRepoPath(inputPath: string): string;
  classifyProjectDirectory(inputPath: string): ReturnType<typeof classifyProjectDirectory>;
};

const DEFAULT_DEPENDENCIES: ReadinessDependencies = {
  accessSync: fs.accessSync,
  existsSync: fs.existsSync,
  platform: process.platform,
  pathEnv: process.env.PATH ?? "",
  pathextEnv: process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM",
  readFileSync: fs.readFileSync,
  validateRepoPath,
  classifyProjectDirectory
};

function createCheck(
  key: ReadinessCheck["key"],
  status: ReadinessStatus,
  message: string,
  recommendedAction: string
): ReadinessCheck {
  return { key, status, message, recommendedAction };
}

function computeOverallStatus(items: ReadinessCheck[]): ReadinessStatus {
  if (items.some((item) => item.status === "failed")) {
    return "failed";
  }

  if (items.some((item) => item.status === "warning")) {
    return "warning";
  }

  return "passed";
}

function buildExecutableCandidates(commandName: string, dependencies: ReadinessDependencies): string[] {
  if (path.isAbsolute(commandName) || commandName.includes("/") || commandName.includes("\\")) {
    return [commandName];
  }

  const pathEntries = dependencies.pathEnv.split(path.delimiter).filter(Boolean);
  const windowsExtensions =
    dependencies.platform === "win32"
      ? dependencies.pathextEnv
          .split(";")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [""];

  const suffixes = dependencies.platform === "win32" ? windowsExtensions : [""];

  return pathEntries.flatMap((pathEntry) => {
    if (dependencies.platform !== "win32") {
      return [path.join(pathEntry, commandName)];
    }

    const lowerName = commandName.toLowerCase();
    const hasKnownExtension = suffixes.some((suffix) => lowerName.endsWith(suffix.toLowerCase()));
    if (hasKnownExtension) {
      return [path.join(pathEntry, commandName)];
    }

    return suffixes.map((suffix) => path.join(pathEntry, `${commandName}${suffix}`));
  });
}

function isExecutableAvailable(commandName: string, dependencies: ReadinessDependencies): boolean {
  for (const candidate of buildExecutableCandidates(commandName, dependencies)) {
    try {
      dependencies.accessSync(
        candidate,
        dependencies.platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK
      );
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

function readIntegerFile(targetPath: string, dependencies: ReadinessDependencies): number | null {
  try {
    const rawValue = dependencies.readFileSync(targetPath, "utf8").trim();
    if (!rawValue) {
      return null;
    }

    const parsedValue = Number.parseInt(rawValue, 10);
    return Number.isNaN(parsedValue) ? null : parsedValue;
  } catch {
    return null;
  }
}

export function runEnvironmentReadinessChecks(
  config: AppConfig,
  repoPath: string,
  dependencies: Partial<ReadinessDependencies> = {}
): ReadinessSummary {
  const resolvedDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const items: ReadinessCheck[] = [];

  items.push(
    isExecutableAvailable(config.codexExecutablePath, resolvedDependencies)
      ? createCheck(
          "codex-executable",
          "passed",
          `Codex is available as ${config.codexExecutablePath}.`,
          "No action needed."
        )
      : createCheck(
          "codex-executable",
          "failed",
          `Codex is not available as ${config.codexExecutablePath}.`,
          "Install Codex or update the Codex executable path in Settings before starting a session."
        )
  );

  items.push(
    isExecutableAvailable("git", resolvedDependencies)
      ? createCheck("git-executable", "passed", "Git is available for repo status, diffs, and Git setup.", "No action needed.")
      : createCheck(
          "git-executable",
          "warning",
          "Git is not available on this machine right now.",
          "Install Git if you want repo status, diff inspection, or Git initialization from the app."
        )
  );

  let validatedRepoPath: string | null = null;
  const projectProfile = resolvedDependencies.classifyProjectDirectory(repoPath);

  try {
    validatedRepoPath = resolvedDependencies.validateRepoPath(repoPath);
    const projectMessage =
      projectProfile.kind === "git-repository"
        ? `Recognized a Git repository at ${validatedRepoPath}.`
        : projectProfile.markers.length > 0
          ? `Recognized a project folder at ${validatedRepoPath} using markers like ${projectProfile.markers.join(", ")}.`
          : `Project folder looks ready: ${validatedRepoPath}.`;
    items.push(
      createCheck(
        "project-folder",
        "passed",
        projectMessage,
        projectProfile.kind === "git-repository"
          ? "No action needed. Codex can work directly in this repository."
          : "No action needed. This folder looks like a real project workspace."
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not validate the selected project folder.";
    const recommendedAction =
      projectProfile.kind === "broad-parent-folder"
        ? "This looks like a parent folder. Choose the specific project folder you want Codex to work in."
        : projectProfile.kind === "empty-folder"
          ? "Use Create new project here, or choose an existing project folder that already contains source or repo files."
          : projectProfile.kind === "file"
            ? "Choose a folder path rather than a single file."
            : "Choose one real project folder with project files such as .git, package.json, pyproject.toml, Cargo.toml, go.mod, pom.xml, build.gradle, or README.md.";
    items.push(
      createCheck(
        "project-folder",
        "failed",
        message,
        recommendedAction
      )
    );
  }

  if (validatedRepoPath) {
    try {
      resolvedDependencies.accessSync(validatedRepoPath, fs.constants.R_OK);
      resolvedDependencies.accessSync(validatedRepoPath, fs.constants.W_OK);
      items.push(
        createCheck(
          "project-access",
          "passed",
          "Project folder is readable and writable for normal Codex work.",
          "No action needed."
        )
      );
    } catch {
      items.push(
        createCheck(
          "project-access",
          "failed",
          `Project folder access is too limited for normal Codex work: ${validatedRepoPath}.`,
          "Make sure this folder can be read and written by the user running the web console before starting a session."
        )
      );
    }
  } else {
    items.push(
      createCheck(
        "project-access",
        "warning",
        "Project access could not be checked yet because the selected folder is not ready.",
        "Fix the project-folder issue above, then run the checks again."
      )
    );
  }

  if (resolvedDependencies.platform !== "linux") {
    items.push(
      createCheck(
        "bubblewrap",
        "passed",
        "Bubblewrap checks apply only when the local server is running on Linux.",
        "No action needed on this platform."
      )
    );
    items.push(
      createCheck(
        "user-namespaces",
        "passed",
        "Linux user-namespace checks apply only when the local server is running on Linux.",
        "No action needed on this platform."
      )
    );
  } else {
    const hasBubblewrap = isExecutableAvailable("bwrap", resolvedDependencies);
    items.push(
      hasBubblewrap
        ? createCheck("bubblewrap", "passed", "Bubblewrap is available for Linux sandbox startup.", "No action needed.")
        : createCheck(
            "bubblewrap",
            "failed",
            "Bubblewrap is not available on this Linux host.",
            "Install bubblewrap and make sure the bwrap command is available before starting Codex."
          )
    );

    const unprivilegedClone = readIntegerFile("/proc/sys/kernel/unprivileged_userns_clone", resolvedDependencies);
    const maxUserNamespaces = readIntegerFile("/proc/sys/user/max_user_namespaces", resolvedDependencies);

    if (unprivilegedClone === 0 || maxUserNamespaces === 0) {
      items.push(
        createCheck(
          "user-namespaces",
          "failed",
          "Linux user namespaces appear to be disabled on this host, so the Codex sandbox is unlikely to start cleanly.",
          "Enable user namespaces on this Linux host, then run the checks again."
        )
      );
    } else if (unprivilegedClone === null && maxUserNamespaces === null) {
      items.push(
        createCheck(
          "user-namespaces",
          "warning",
          "The app could not verify Linux user-namespace readiness automatically.",
          "If Codex later reports a sandbox or bubblewrap problem, verify that user namespaces are enabled on this Linux host."
        )
      );
    } else {
      items.push(
        createCheck(
          "user-namespaces",
          "passed",
          "Linux user-namespace settings look compatible with normal Codex sandbox startup.",
          "No action needed."
        )
      );
    }
  }

  const overallStatus = computeOverallStatus(items);

  return {
    overallStatus,
    canStart: overallStatus !== "failed",
    checkedAt: new Date().toISOString(),
    repoPath: repoPath.trim(),
    items
  };
}
