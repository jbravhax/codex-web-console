import { describe, expect, it, vi } from "vitest";
import {
  chooseRepoDirectory,
  REPO_PICKER_MISSING_PATH_MESSAGE,
  REPO_PICKER_UNSUPPORTED_MESSAGE,
  resolveRepoPathFromHandle
} from "./repo-picker";

describe("repo directory picker", () => {
  it("returns the selected repo path when the picker is supported and exposes an absolute path", async () => {
    const result = await chooseRepoDirectory({
      showDirectoryPicker: vi.fn().mockResolvedValue({
        name: "project",
        path: "/workspace/project"
      })
    });

    expect(result).toEqual({
      kind: "selected",
      repoPath: "/workspace/project"
    });
  });

  it("returns the unsupported message when the picker is not available", async () => {
    const result = await chooseRepoDirectory({});

    expect(result).toEqual({
      kind: "unsupported",
      message: REPO_PICKER_UNSUPPORTED_MESSAGE
    });
  });

  it("returns a cancelled result when the user dismisses the picker", async () => {
    const result = await chooseRepoDirectory({
      showDirectoryPicker: vi.fn().mockRejectedValue(
        Object.assign(new Error("User cancelled picker"), { name: "AbortError" })
      )
    });

    expect(result).toEqual({
      kind: "cancelled"
    });
  });

  it("falls back to manual path entry when the browser does not expose a usable path", async () => {
    const result = await chooseRepoDirectory({
      showDirectoryPicker: vi.fn().mockResolvedValue({
        name: "project"
      })
    });

    expect(result).toEqual({
      kind: "missing-path",
      message: REPO_PICKER_MISSING_PATH_MESSAGE
    });
  });
});

describe("resolveRepoPathFromHandle", () => {
  it("rejects non-absolute paths instead of faking a repo path", () => {
    expect(resolveRepoPathFromHandle({ path: "project" })).toBeNull();
  });
});
