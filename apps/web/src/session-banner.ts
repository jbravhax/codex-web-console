export type SessionBannerState =
  | "idle"
  | "connecting"
  | "starting"
  | "running"
  | "awaiting-approval"
  | "awaiting-input"
  | "completed"
  | "stopping"
  | "stopped"
  | "disconnected"
  | "failed";

export type SessionBanner = {
  state: SessionBannerState;
  title: string;
  detail: string;
};

type SessionBannerEvent =
  | { type: "websocket-connecting" }
  | { type: "websocket-open" }
  | { type: "start-requested"; repoPath: string }
  | { type: "prompt-submitted" }
  | { type: "status-received"; active: boolean; repoPath: string | null }
  | { type: "waiting-for-approval" }
  | { type: "waiting-for-input"; repoPath: string | null }
  | { type: "completion-detected"; repoPath: string | null }
  | { type: "activity-detected"; repoPath: string | null }
  | { type: "stop-requested" }
  | { type: "exit-received"; exitCode: number; signal: number; failedDetail?: string }
  | { type: "websocket-close"; detail: string }
  | { type: "error-received"; detail: string };

export function formatSessionBannerStateLabel(state: SessionBannerState): string {
  switch (state) {
    case "awaiting-approval":
      return "Awaiting approval";
    case "awaiting-input":
      return "Awaiting input";
    default:
      return state.replace(/-/g, " ");
  }
}

function formatRepoTarget(repoPath: string | null): string {
  return repoPath && repoPath.trim().length > 0 ? repoPath : "the selected repo";
}

export function createInitialSessionBanner(): SessionBanner {
  return {
    state: "connecting",
    title: "Connecting",
    detail: "Connecting to the local Codex server..."
  };
}

export function reduceSessionBanner(previous: SessionBanner, event: SessionBannerEvent): SessionBanner {
  if (event.type === "websocket-connecting") {
    return createInitialSessionBanner();
  }

  if (event.type === "websocket-open") {
    return {
      state: "idle",
      title: "Idle",
      detail: "Connected. Ready to start a Codex session."
    };
  }

  if (event.type === "start-requested") {
    return {
      state: "starting",
      title: "Starting session",
      detail: `Starting Codex in ${formatRepoTarget(event.repoPath)}. This needs to be a real project folder, not a broad parent directory.`
    };
  }

  if (event.type === "prompt-submitted") {
    return {
      state: "running",
      title: "Running request",
      detail: "Prompt sent. Codex is now working in the terminal below. If it needs approval or more input, the browser will call that out here."
    };
  }

  if (event.type === "status-received") {
    if (event.active) {
      return {
        state: "running",
        title: "Session running",
        detail: `Codex is running in ${formatRepoTarget(event.repoPath)}.`
      };
    }

    if (previous.state === "stopping" || previous.state === "stopped") {
      return previous;
    }

    return {
      state: "idle",
      title: "Idle",
      detail: "Connected. Ready to start a Codex session."
    };
  }

  if (event.type === "waiting-for-approval") {
    return {
      state: "awaiting-approval",
      title: "Waiting for approval",
      detail:
        "Codex is waiting for approval in the terminal. Approve in the terminal and work will continue automatically. Press Enter there to approve or Esc to cancel."
    };
  }

  if (event.type === "waiting-for-input") {
    return {
      state: "awaiting-input",
      title: "Waiting for your next input",
      detail: `Codex has finished the current step in ${formatRepoTarget(event.repoPath)} and is waiting in the terminal for your next instruction. Type in the prompt box or interact directly with the terminal to continue.`
    };
  }

  if (event.type === "completion-detected") {
    return {
      state: "completed",
      title: "Request completed",
      detail: `Codex appears to have finished the current request in ${formatRepoTarget(event.repoPath)}. Review the terminal output, then send the next prompt when you're ready.`
    };
  }

  if (event.type === "activity-detected") {
    return {
      state: "running",
      title: "Codex is responding",
      detail: `Codex is processing output in ${formatRepoTarget(event.repoPath)}. Stay in the terminal area if you expect follow-up prompts or approvals.`
    };
  }

  if (event.type === "stop-requested") {
    return {
      state: "stopping",
      title: "Stopping session",
      detail: "Stopping the current Codex session..."
    };
  }

  if (event.type === "exit-received") {
    if (event.failedDetail) {
      return {
        state: "failed",
        title: "Session failed",
        detail: event.failedDetail
      };
    }

    if (previous.state === "stopping") {
      return {
        state: "stopped",
        title: "Session stopped",
        detail: `The stop request finished and Codex exited with code ${event.exitCode} and signal ${event.signal}.`
      };
    }

    if (event.exitCode === 0) {
      return {
        state: "completed",
        title: "Session completed",
        detail: "Codex exited cleanly after finishing the session. Review the terminal output or send another prompt when you're ready."
      };
    }

    return {
      state: "stopped",
      title: "Session stopped",
      detail: `Codex exited with code ${event.exitCode} and signal ${event.signal}.`
    };
  }

  if (event.type === "websocket-close") {
    if (previous.state === "stopping" || previous.state === "stopped") {
      return {
        state: "stopped",
        title: "Session stopped",
        detail: `The browser disconnected after the stop request. ${event.detail}`
      };
    }

    return {
      state: "disconnected",
      title: "Disconnected",
      detail: event.detail
    };
  }

  return {
    state: "failed",
    title: "Session failed",
    detail: event.detail
  };
}
