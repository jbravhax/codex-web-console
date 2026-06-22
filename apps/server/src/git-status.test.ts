import { describe, expect, it } from "vitest";
import { parseGitStatusOutput } from "./git-status.js";

describe("parseGitStatusOutput", () => {
  it("parses branch name and file counts from porcelain output", () => {
    const summary = parseGitStatusOutput(
      "/workspace/project",
      ["## main...origin/main", " M src/app.ts", "M  src/server.ts", "?? notes.md"].join("\n")
    );

    expect(summary).toEqual({
      repoPath: "/workspace/project",
      isGitRepo: true,
      branch: "main",
      changedFilesCount: 2,
      stagedFilesCount: 1,
      untrackedFilesCount: 1
    });
  });

  it("handles detached head state", () => {
    const summary = parseGitStatusOutput("/workspace/project", "## HEAD (no branch)\n");

    expect(summary.branch).toBe("detached");
    expect(summary.changedFilesCount).toBe(0);
    expect(summary.stagedFilesCount).toBe(0);
    expect(summary.untrackedFilesCount).toBe(0);
  });

  it("counts a staged-only file as changed and staged", () => {
    const summary = parseGitStatusOutput("/workspace/project", ["## feature/staged-only", "M  src/server.ts"].join("\n"));

    expect(summary.branch).toBe("feature/staged-only");
    expect(summary.changedFilesCount).toBe(1);
    expect(summary.stagedFilesCount).toBe(1);
    expect(summary.untrackedFilesCount).toBe(0);
  });

  it("counts an unstaged-only file as changed without staging it", () => {
    const summary = parseGitStatusOutput("/workspace/project", ["## feature/unstaged-only", " M src/app.ts"].join("\n"));

    expect(summary.branch).toBe("feature/unstaged-only");
    expect(summary.changedFilesCount).toBe(1);
    expect(summary.stagedFilesCount).toBe(0);
    expect(summary.untrackedFilesCount).toBe(0);
  });

  it("counts a file with both staged and unstaged changes in both categories", () => {
    const summary = parseGitStatusOutput("/workspace/project", ["## feature/status-panel", "MM src/app.ts"].join("\n"));

    expect(summary.branch).toBe("feature/status-panel");
    expect(summary.changedFilesCount).toBe(1);
    expect(summary.stagedFilesCount).toBe(1);
    expect(summary.untrackedFilesCount).toBe(0);
  });
});
