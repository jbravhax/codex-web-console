import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildGitDiffEmptyState, buildGitDiffPanelText, copyGitDiffText, loadGitDiff } from "./git-diff-viewer";

beforeEach(() => {
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined)
    }
  });
});

describe("git diff viewer helpers", () => {
  it("loads diff data from the backend endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        repoPath: "/workspace/project",
        isGitRepo: true,
        stagedDiff: "diff --git a/a.ts b/a.ts\n",
        unstagedDiff: ""
      })
    });

    await expect(loadGitDiff("/workspace/project", fetchImpl as never)).resolves.toEqual({
      repoPath: "/workspace/project",
      isGitRepo: true,
      stagedDiff: "diff --git a/a.ts b/a.ts\n",
      unstagedDiff: ""
    });
  });

  it("builds an empty diff message when there are no changes", () => {
    expect(
      buildGitDiffEmptyState({
        repoPath: "/workspace/project",
        isGitRepo: true,
        stagedDiff: "",
        unstagedDiff: ""
      })
    ).toBe("No current staged or unstaged changes.");
  });

  it("formats staged and unstaged diff sections", () => {
    expect(
      buildGitDiffPanelText({
        repoPath: "/workspace/project",
        isGitRepo: true,
        stagedDiff: "diff --git a/a.ts b/a.ts\n",
        unstagedDiff: "diff --git a/b.ts b/b.ts\n"
      })
    ).toContain("=== Staged changes ===");
  });

  it("copies diff text", async () => {
    await copyGitDiffText("diff --git a/a.ts b/a.ts");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("diff --git a/a.ts b/a.ts");
  });

  it("falls back to document copy when diff clipboard write fails", async () => {
    const clipboard = {
      writeText: vi.fn().mockRejectedValue(new Error("clipboard blocked"))
    };
    const textarea = {
      value: "",
      setAttribute: vi.fn(),
      style: {} as CSSStyleDeclaration,
      focus: vi.fn(),
      select: vi.fn()
    } as unknown as HTMLTextAreaElement;
    const doc = {
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn()
      },
      createElement: vi.fn().mockReturnValue(textarea),
      execCommand: vi.fn().mockReturnValue(true)
    } as unknown as Document;

    await copyGitDiffText("diff --git a/a.ts b/a.ts", clipboard, doc);

    expect(doc.execCommand).toHaveBeenCalledWith("copy");
  });
});
