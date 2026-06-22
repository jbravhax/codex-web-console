import { describe, expect, it } from "vitest";
import {
  buildSessionErrorDisplay,
  buildWebSocketCloseDisplay,
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

  it("builds actionable disconnect guidance for browser refreshes and dropped live sessions", () => {
    expect(buildWebSocketCloseDisplay(1001, "browser closed", false)).toEqual({
      detail:
        "The live session connection ended because the browser page was closed, refreshed, or navigated away from. Reopen the app and start a new session to continue.",
      technicalDetail: "websocket connection closed with code 1001. Reason: browser closed"
    });

    expect(buildWebSocketCloseDisplay(1006, "server stopped", false)).toEqual({
      detail:
        "The live session disconnected from the local Codex server. If the local server stopped, restart it. Then reopen or refresh the browser and start a new session because this app does not resume a live terminal connection yet.",
      technicalDetail: "websocket connection closed with code 1006. Reason: server stopped"
    });
  });
});
