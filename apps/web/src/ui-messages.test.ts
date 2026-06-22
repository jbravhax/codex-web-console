import { describe, expect, it } from "vitest";
import { friendlyUploadErrorMessage } from "./ui-messages";

describe("friendlyUploadErrorMessage", () => {
  it("maps unsupported type errors to a friendly message", () => {
    expect(friendlyUploadErrorMessage("Unsupported file type.")).toContain("not supported here");
  });

  it("maps ZIP extraction failures to a clearer message", () => {
    expect(friendlyUploadErrorMessage("ZIP contains a path traversal entry, which is not allowed.")).toContain(
      "ZIP extraction failed"
    );
  });

  it("maps session-required errors to clearer guidance", () => {
    expect(friendlyUploadErrorMessage("Start a Codex session before attaching files.")).toContain(
      "Start a Codex session"
    );
  });

  it("maps oversize pasted context errors to clearer guidance", () => {
    expect(friendlyUploadErrorMessage("Pasted content is too large. The current limit is 1MB.")).toContain(
      "pasted text is too large"
    );
  });
});
