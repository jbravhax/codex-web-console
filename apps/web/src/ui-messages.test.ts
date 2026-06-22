import { describe, expect, it } from "vitest";
import { friendlyUploadErrorMessage } from "./ui-messages";

describe("friendlyUploadErrorMessage", () => {
  it("maps unsupported type errors to a friendly message", () => {
    expect(friendlyUploadErrorMessage("Could not upload attachment. Unsupported file type.")).toContain(
      "Could not add that file"
    );
  });

  it("maps ZIP extraction failures to a clearer message", () => {
    expect(friendlyUploadErrorMessage("ZIP contains a path traversal entry, which is not allowed.")).toContain(
      "Could not finish the ZIP upload"
    );
  });

  it("maps session-required errors to clearer guidance", () => {
    expect(friendlyUploadErrorMessage("Start a Codex session before attaching files.")).toContain(
      "Start a Codex session"
    );
  });

  it("preserves actionable repo path validation guidance", () => {
    expect(friendlyUploadErrorMessage("The path does not exist: /workspace/missing")).toContain(
      "Create it first"
    );
    expect(
      friendlyUploadErrorMessage(
        "That folder does not look like a project yet. Start in a folder that already contains project files such as .git, README.md, package.json, pyproject.toml, or Cargo.toml."
      )
    ).toContain("Git metadata is helpful but not required");
    expect(
      friendlyUploadErrorMessage(
        "That folder looks like a broad parent directory that contains multiple projects. Open one specific project folder inside it instead."
      )
    ).toContain("contains multiple projects");
  });

  it("maps oversize pasted context errors to clearer guidance", () => {
    expect(friendlyUploadErrorMessage("Pasted content is too large. The current limit is 1MB.")).toContain(
      "Could not save that pasted text"
    );
  });

  it("maps attachment size limits to action-owned guidance", () => {
    expect(friendlyUploadErrorMessage("Could not upload attachment. Attachment exceeds the 10MB limit.")).toContain(
      "Could not upload that file"
    );
  });
});
