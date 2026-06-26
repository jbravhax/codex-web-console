import { describe, expect, it } from "vitest";
import { findCodexSession, isCodexSessionId } from "./codex-sessions.js";

describe("codex session helpers", () => {
  it("validates UUID-shaped Codex session ids", () => {
    expect(isCodexSessionId("019eec5a-6dc8-7b71-b155-e96551e7c367")).toBe(true);
    expect(isCodexSessionId("not-a-session")).toBe(false);
  });

  it("returns null immediately for invalid ids", () => {
    expect(findCodexSession("bad-value")).toBeNull();
  });
});
