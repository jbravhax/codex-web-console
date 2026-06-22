export type SessionFailureCategory =
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
};

export type SessionErrorDisplay = {
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

export function isStructuredSessionFailure(value: unknown): value is SessionFailurePayload {
  return isFailurePayload(value);
}
