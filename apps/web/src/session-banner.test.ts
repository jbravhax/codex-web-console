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

    expect(connecting.state).toBe("starting");
    expect(running).toEqual({
      state: "running",
      title: "Session running",
      detail: "Codex is running in /workspace/project."
    });
  });

  it("shows running and approval states while codex is working through a request", () => {
    const waitingForCodex = reduceSessionBanner(createInitialSessionBanner(), { type: "prompt-submitted" });
    const waitingForApproval = reduceSessionBanner(waitingForCodex, { type: "waiting-for-approval" });

    expect(waitingForCodex).toEqual({
      state: "running",
      title: "Running request",
      detail: "Prompt sent. Codex is now working in the terminal below. If it needs approval or more input, the browser will call that out here."
    });
    expect(waitingForApproval).toEqual({
      state: "awaiting-approval",
      title: "Waiting for approval",
      detail:
        "Codex is waiting for approval in the terminal. Approve in the terminal and work will continue automatically. Press Enter there to approve or Esc to cancel."
    });
  });

  it("shows explicit waiting-for-input and completed states", () => {
    const awaitingInput = reduceSessionBanner(createInitialSessionBanner(), {
      type: "waiting-for-input",
      repoPath: "/workspace/project"
    });
    const completed = reduceSessionBanner(awaitingInput, {
      type: "completion-detected",
      repoPath: "/workspace/project"
    });

    expect(awaitingInput).toEqual({
      state: "awaiting-input",
      title: "Waiting for your next input",
      detail:
        "Codex has finished the current step in /workspace/project and is waiting in the terminal for your next instruction. Type in the prompt box or interact directly with the terminal to continue."
    });
    expect(completed).toEqual({
      state: "completed",
      title: "Request completed",
      detail:
        "Codex appears to have finished the current request in /workspace/project. Review the terminal output, then send the next prompt when you're ready."
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
    expect(stopped.detail).toContain("stop request finished");
    expect(afterStatus).toEqual(stopped);
  });

  it("shows disconnected status for websocket close when the app was not already stopping", () => {
    const failed = reduceSessionBanner(createInitialSessionBanner(), {
      type: "websocket-close",
      detail: "Connection to the local Codex server was closed. Restart the server if needed."
    });

    expect(failed).toEqual({
      state: "disconnected",
      title: "Disconnected",
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
