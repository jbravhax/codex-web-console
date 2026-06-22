import { describe, expect, it } from "vitest";
import { createInitialSessionBanner, reduceSessionBanner } from "./session-banner";

describe("session banner state", () => {
  it("starts in connecting and moves to idle on websocket open", () => {
    const initial = createInitialSessionBanner();
    const next = reduceSessionBanner(initial, { type: "websocket-open" });

    expect(initial.state).toBe("connecting");
    expect(next).toEqual({
      state: "idle",
      title: "Idle",
      detail: "Connected. Ready to start a Codex session."
    });
  });

  it("moves from start requested to running when the server reports an active session", () => {
    const connecting = reduceSessionBanner(createInitialSessionBanner(), {
      type: "start-requested",
      repoPath: "/workspace/project"
    });
    const running = reduceSessionBanner(connecting, {
      type: "status-received",
      active: true,
      repoPath: "/workspace/project"
    });

    expect(connecting.state).toBe("connecting");
    expect(running).toEqual({
      state: "running",
      title: "Session running",
      detail: "Codex is running in /workspace/project."
    });
  });

  it("shows waiting states for prompt submission and terminal approvals", () => {
    const waitingForCodex = reduceSessionBanner(createInitialSessionBanner(), { type: "prompt-submitted" });
    const waitingForApproval = reduceSessionBanner(waitingForCodex, { type: "waiting-for-approval" });

    expect(waitingForCodex).toEqual({
      state: "waiting",
      title: "Waiting for Codex",
      detail: "Prompt sent. Watch the terminal below. If Codex asks for approval, press Enter to approve or Esc to cancel."
    });
    expect(waitingForApproval).toEqual({
      state: "waiting",
      title: "Approval needed",
      detail: "Codex is waiting in the terminal below for your confirmation. Review the request, then press Enter to approve or Esc to cancel."
    });
  });

  it("returns to a readable running state once codex activity resumes", () => {
    const running = reduceSessionBanner(createInitialSessionBanner(), {
      type: "activity-detected",
      repoPath: "/workspace/project"
    });

    expect(running).toEqual({
      state: "running",
      title: "Codex is responding",
      detail: "Codex is processing output in /workspace/project. Stay in the terminal area if you expect follow-up prompts or approvals."
    });
  });

  it("moves from stopping to stopped when the process exits and ignores the follow-up inactive status", () => {
    const stopping = reduceSessionBanner(createInitialSessionBanner(), { type: "stop-requested" });
    const stopped = reduceSessionBanner(stopping, { type: "exit-received", exitCode: 0, signal: 15 });
    const afterStatus = reduceSessionBanner(stopped, {
      type: "status-received",
      active: false,
      repoPath: "/workspace/project"
    });

    expect(stopping.state).toBe("stopping");
    expect(stopped.state).toBe("stopped");
    expect(afterStatus).toEqual(stopped);
  });

  it("shows failed status for websocket close when the app was not already stopping", () => {
    const failed = reduceSessionBanner(createInitialSessionBanner(), {
      type: "websocket-close",
      detail: "Connection to the local Codex server was closed. Restart the server if needed."
    });

    expect(failed).toEqual({
      state: "failed",
      title: "Connection lost",
      detail: "Connection to the local Codex server was closed. Restart the server if needed."
    });
  });

  it("shows failed status with the backend error text", () => {
    const failed = reduceSessionBanner(createInitialSessionBanner(), {
      type: "error-received",
      detail: "Repo path is not valid."
    });

    expect(failed).toEqual({
      state: "failed",
      title: "Session failed",
      detail: "Repo path is not valid."
    });
  });
});
