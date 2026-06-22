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
        "That folder does not look like a project yet. Expected one of: .git, package.json, pyproject.toml, Cargo.toml, or README.md."
      )
    ).toContain("not a parent folder");
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
