import { copyTextWithFallback } from "./clipboard";

export type GitDiffSummary = {
  repoPath: string;
  isGitRepo: boolean;
  stagedDiff: string;
  unstagedDiff: string;
  message?: string;
};

export async function loadGitDiff(
  repoPath: string,
  fetchImpl: typeof fetch = fetch
): Promise<GitDiffSummary> {
  const response = await fetchImpl(`/api/git/diff?repoPath=${encodeURIComponent(repoPath)}`);
  const payload = (await response.json()) as GitDiffSummary | { error?: string };

  if (!response.ok || ("error" in payload && typeof payload.error === "string")) {
    throw new Error("error" in payload && payload.error ? payload.error : "Could not load Git diff.");
  }

  return payload as GitDiffSummary;
}

export function buildGitDiffPanelText(diff: GitDiffSummary): string {
  const sections: string[] = [];

  if (diff.stagedDiff.trim()) {
    sections.push(["=== Staged changes ===", diff.stagedDiff.trimEnd()].join("\n"));
  }

  if (diff.unstagedDiff.trim()) {
    sections.push(["=== Unstaged changes ===", diff.unstagedDiff.trimEnd()].join("\n"));
  }

  return sections.join("\n\n");
}

export function buildGitDiffEmptyState(diff: GitDiffSummary): string {
  if (!diff.isGitRepo) {
    return diff.message || "This folder is not a Git repository.";
  }

  if (!diff.stagedDiff.trim() && !diff.unstagedDiff.trim()) {
    return "No current staged or unstaged changes.";
  }

  return "";
}

export function copyGitDiffText(
  text: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined = navigator.clipboard,
  doc: Document = document
){
  return copyTextWithFallback(text, clipboard, doc);
}
