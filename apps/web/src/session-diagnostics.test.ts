import { describe, expect, it } from "vitest";
import {
  buildSessionErrorDisplay,
  buildUnexpectedExitDisplay,
  type SessionFailurePayload
} from "./session-diagnostics";

describe("session diagnostics", () => {
  it("builds a friendly display from a structured startup failure", () => {
    const payload: SessionFailurePayload = {
      category: "codex-not-found",
      userMessage:
        "Codex could not be started because the configured executable was not found. Check the Codex executable path in Settings and make sure Codex is installed on this machine.",
      technicalDetail: "spawn codex ENOENT"
    };

    expect(buildSessionErrorDisplay(payload)).toEqual({
      detail:
        "Codex could not be started because the configured executable was not found. Check the Codex executable path in Settings and make sure Codex is installed on this machine.",
      technicalDetail: "spawn codex ENOENT"
    });
  });

  it("builds an unexpected-exit display when the server provides a categorized failure", () => {
    expect(
      buildUnexpectedExitDisplay({
        exitCode: 1,
        signal: 0,
        failure: {
          category: "sandbox-unavailable",
          userMessage:
            "Codex could not finish starting its Linux sandbox for /workspace/project. Make sure bubblewrap is installed and that this Linux host allows the required user namespace setup.",
          technicalDetail: "bubblewrap user namespace setup failed"
        }
      })
    ).toEqual({
      detail:
        "Codex could not finish starting its Linux sandbox for /workspace/project. Make sure bubblewrap is installed and that this Linux host allows the required user namespace setup.",
      technicalDetail: "bubblewrap user namespace setup failed"
    });
  });
});
