import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { validateInspectableDirectoryPath } from "./repo-paths.js";

const execFileAsync = promisify(execFile);

export type GitDiffSummary = {
  repoPath: string;
  isGitRepo: boolean;
  stagedDiff: string;
  unstagedDiff: string;
  message?: string;
};

function readStderr(error: unknown): string {
  return typeof error === "object" && error !== null && "stderr" in error && typeof error.stderr === "string"
    ? error.stderr
    : "";
}

export async function getGitDiff(repoPathInput: string): Promise<GitDiffSummary> {
  const repoPath = validateInspectableDirectoryPath(repoPathInput);

  try {
    const [unstagedResult, stagedResult] = await Promise.all([
      execFileAsync("git", ["diff", "--no-ext-diff"], {
        cwd: repoPath,
        windowsHide: true
      }),
      execFileAsync("git", ["diff", "--cached", "--no-ext-diff"], {
        cwd: repoPath,
        windowsHide: true
      })
    ]);

    return {
      repoPath,
      isGitRepo: true,
      stagedDiff: stagedResult.stdout,
      unstagedDiff: unstagedResult.stdout
    };
  } catch (error) {
    const stderr = readStderr(error);
    if (stderr.includes("not a git repository")) {
      return {
        repoPath,
        isGitRepo: false,
        stagedDiff: "",
        unstagedDiff: "",
        message: "This folder is not a Git repository."
      };
    }

    throw new Error("Could not read Git diff for this folder.");
  }
}
