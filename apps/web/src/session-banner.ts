export type SessionBannerState = "idle" | "connecting" | "running" | "stopping" | "stopped" | "failed";

export type SessionBanner = {
  state: SessionBannerState;
  title: string;
  detail: string;
};

type SessionBannerEvent =
  | { type: "websocket-connecting" }
  | { type: "websocket-open" }
  | { type: "start-requested"; repoPath: string }
  | { type: "status-received"; active: boolean; repoPath: string | null }
  | { type: "stop-requested" }
  | { type: "exit-received"; exitCode: number; signal: number }
  | { type: "websocket-close"; detail: string }
  | { type: "error-received"; detail: string };

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
      state: "connecting",
      title: "Starting session",
      detail: `Starting Codex in ${formatRepoTarget(event.repoPath)}...`
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

  if (event.type === "stop-requested") {
    return {
      state: "stopping",
      title: "Stopping session",
      detail: "Stopping the current Codex session..."
    };
  }

  if (event.type === "exit-received") {
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
        detail: event.detail
      };
    }

    return {
      state: "failed",
      title: "Connection lost",
      detail: event.detail
    };
  }

  return {
    state: "failed",
    title: "Session failed",
    detail: event.detail
  };
}
