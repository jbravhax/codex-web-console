export type SessionFailureCategory =
  | "invalid-session-id"
  | "session-not-found"
  | "invalid-repo-path"
  | "repo-path-does-not-exist"
  | "repo-path-not-project"
  | "codex-not-found"
  | "permission-denied"
  | "sandbox-unavailable"
  | "pty-start-failed"
  | "websocket-disconnect"
  | "process-exited-unexpectedly"
  | "unknown";

export type SessionFailurePayload = {
  category: SessionFailureCategory;
  userMessage: string;
  technicalDetail: string;
};

export type SessionExitPayload = {
  exitCode: number;
  signal: number;
  startedAt?: string | null;
  endedAt?: string | null;
  failure?: SessionFailurePayload | null;
  resumeAvailable?: boolean;
};

export type SessionErrorDisplay = {
  detail: string;
  technicalDetail: string;
};

export type WebSocketCloseDisplay = {
  detail: string;
  technicalDetail: string;
};

function isFailurePayload(value: unknown): value is SessionFailurePayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "category" in value &&
    "userMessage" in value &&
    "technicalDetail" in value
  );
}

export function buildSessionErrorDisplay(payload: string | SessionFailurePayload): SessionErrorDisplay {
  if (typeof payload === "string") {
    return {
      detail: payload,
      technicalDetail: payload
    };
  }

  return {
    detail: payload.userMessage,
    technicalDetail: payload.technicalDetail
  };
}

export function buildUnexpectedExitDisplay(payload: SessionExitPayload): SessionErrorDisplay | null {
  if (!payload.failure) {
    return null;
  }

  return buildSessionErrorDisplay(payload.failure);
}

export function buildWebSocketCloseDisplay(
  closeCode: number,
  closeReason: string,
  wasStopping: boolean
): WebSocketCloseDisplay {
  const normalizedReason = closeReason.trim().length > 0 ? closeReason.trim() : "No close reason was provided.";
  const technicalDetail = `websocket connection closed with code ${closeCode}. Reason: ${normalizedReason}`;

  if (wasStopping) {
    return {
      detail:
        "The browser disconnected after the stop request. If Codex already finished stopping, start a fresh session when you are ready to continue.",
      technicalDetail
    };
  }

  if (closeCode === 1000) {
    return {
      detail:
        "The live session disconnected cleanly from the local Codex server. If you refreshed the browser or navigated away, reopen the app and start a new session because live terminal reattach is not available yet.",
      technicalDetail
    };
  }

  if (closeCode === 1001) {
    return {
      detail:
        "The live session connection ended because the browser page was closed, refreshed, or navigated away from. Reopen the app and start a new session to continue.",
      technicalDetail
    };
  }

  return {
    detail:
      "The live session disconnected from the local Codex server. If the local server stopped, restart it. Then reopen or refresh the browser and start a new session because this app does not resume a live terminal connection yet.",
    technicalDetail
  };
}

export function isStructuredSessionFailure(value: unknown): value is SessionFailurePayload {
  return isFailurePayload(value);
}
