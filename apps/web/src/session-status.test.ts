import { describe, expect, it } from "vitest";
import { createEmptySessionRuntimeStatus, deriveSessionRuntimeStatus, summarizeSessionId } from "./session-status";

const activeStatus = {
  active: true,
  repoPath: "/workspace/project",
  startedAt: "2026-06-25T01:00:00.000Z",
  localSessionId: "session-1234567890",
  nativeSessionId: null
} as const;

describe("session status helpers", () => {
  it("parses model, context, and session id from terminal output when available", () => {
    const result = deriveSessionRuntimeStatus(
      createEmptySessionRuntimeStatus(),
      activeStatus,
      "model:     gpt-5.5\nContext: 32% (64,000/200,000 tokens)\nSession:\n019eec5a-6dc8-7b71-b155-e96551e7c367"
    );

    expect(result.model).toBe("gpt-5.5");
    expect(result.sessionId).toBe("019eec5a-6dc8-7b71-b155-e96551e7c367");
    expect(result.context).toMatchObject({
      available: true,
      percent: 32,
      usedTokens: 64000,
      maxTokens: 200000,
      display: "32% (64,000/200,000)"
    });
  });

  it("keeps availability honest when only estimated token totals are visible", () => {
    const result = deriveSessionRuntimeStatus(createEmptySessionRuntimeStatus(), activeStatus, "Context: 12,345 tokens");

    expect(result.context).toMatchObject({
      available: true,
      usedTokens: 12345,
      display: "12,345 tokens"
    });
  });

  it("does not fall back to the local web session id when no Codex UUID is available", () => {
    const result = deriveSessionRuntimeStatus(createEmptySessionRuntimeStatus(), activeStatus, "Working...");

    expect(result.model).toBeNull();
    expect(result.context.display).toBe("Unavailable");
    expect(result.limits.fiveHourDisplay).toBe("Unavailable");
    expect(result.sessionId).toBeNull();
  });

  it("summarizes ids for compact display", () => {
    expect(summarizeSessionId("019eec5a-6dc8-7b71-b155-e96551e7c367")).toBe("019eec5a");
    expect(summarizeSessionId("session-1234567890ab")).toBe("1234567890ab");
    expect(summarizeSessionId(null)).toBe("-");
  });
});
