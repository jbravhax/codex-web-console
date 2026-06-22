import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { validateInspectableDirectoryPath } from "./repo-paths.js";

const execFileAsync = promisify(execFile);

export type GitStatusSummary = {
  repoPath: string;
  isGitRepo: boolean;
  branch: string | null;
  changedFilesCount: number;
  stagedFilesCount: number;
  untrackedFilesCount: number;
  message?: string;
};

function parseBranch(line: string): string | null {
  if (!line.startsWith("## ")) {
    return null;
  }

  const branchInfo = line.slice(3).trim();
  if (branchInfo.startsWith("HEAD")) {
    return "detached";
  }

  return branchInfo.split("...")[0] || null;
}

export function parseGitStatusOutput(repoPath: string, stdout: string): GitStatusSummary {
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  let branch: string | null = null;
  let changedFilesCount = 0;
  let stagedFilesCount = 0;
  let untrackedFilesCount = 0;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      branch = parseBranch(line);
      continue;
    }

    const indexStatus = line[0] ?? " ";
    const workTreeStatus = line[1] ?? " ";

    if (indexStatus === "?" && workTreeStatus === "?") {
      untrackedFilesCount += 1;
      continue;
    }

    if (indexStatus !== " ") {
      stagedFilesCount += 1;
    }

    if (workTreeStatus !== " ") {
      changedFilesCount += 1;
    }
  }

  return {
    repoPath,
    isGitRepo: true,
    branch,
    changedFilesCount,
    stagedFilesCount,
    untrackedFilesCount
  };
}

export async function getGitStatus(repoPathInput: string): Promise<GitStatusSummary> {
  const repoPath = validateInspectableDirectoryPath(repoPathInput);

  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain", "--branch"], {
      cwd: repoPath,
      windowsHide: true
    });
    return parseGitStatusOutput(repoPath, stdout);
  } catch (error) {
    const stderr =
      typeof error === "object" && error !== null && "stderr" in error && typeof error.stderr === "string"
        ? error.stderr
        : "";

    if (stderr.includes("not a git repository")) {
      return {
        repoPath,
        isGitRepo: false,
        branch: null,
        changedFilesCount: 0,
        stagedFilesCount: 0,
        untrackedFilesCount: 0,
        message: "This folder is not a Git repository."
      };
    }

    throw new Error("Could not read Git status for this folder.");
  }
}
