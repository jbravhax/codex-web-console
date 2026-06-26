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

function createFailure(
  category: SessionFailureCategory,
  userMessage: string,
  technicalDetail: string
): SessionFailurePayload {
  return {
    category,
    userMessage,
    technicalDetail
  };
}

function readErrorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : "";
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown session error.";
}

export function classifySessionStartupError(error: unknown): SessionFailurePayload {
  const technicalDetail = readErrorMessage(error);
  const normalizedDetail = technicalDetail.toLowerCase();
  const code = readErrorCode(error);

  if (normalizedDetail.includes("does not exist")) {
    return createFailure(
      "repo-path-does-not-exist",
      "That project folder does not exist yet. Create it first, then start Codex in that specific folder.",
      technicalDetail
    );
  }

  if (normalizedDetail.includes("valid codex session uuid")) {
    return createFailure(
      "invalid-session-id",
      "Enter a valid Codex session UUID before continuing.",
      technicalDetail
    );
  }

  if (normalizedDetail.includes("no codex session was found for")) {
    return createFailure(
      "session-not-found",
      "That Codex session could not be found on this machine. Check the Session ID and try again.",
      technicalDetail
    );
  }

  if (normalizedDetail.includes("not a directory")) {
    return createFailure(
      "invalid-repo-path",
      "That path points to a file, not a project folder. Enter a specific project folder instead.",
      technicalDetail
    );
  }

  if (normalizedDetail.includes("does not look like a project")) {
    return createFailure(
      "repo-path-not-project",
      "That folder does not look like a project yet. Choose a real project folder, or add .git, README.md, package.json, pyproject.toml, or Cargo.toml first.",
      technicalDetail
    );
  }

  if (
    normalizedDetail.includes("specific folder inside /home") ||
    normalizedDetail.includes("refusing to start codex") ||
    normalizedDetail.includes("enter a repo path before starting codex")
  ) {
    return createFailure(
      "invalid-repo-path",
      "Choose one real project folder before starting Codex. Broad parent folders and protected system paths are not allowed.",
      technicalDetail
    );
  }

  if (code === "ENOENT" || normalizedDetail.includes("spawn codex") || normalizedDetail.includes("not found")) {
    return createFailure(
      "codex-not-found",
      "Codex could not be started because the configured executable was not found. Check the Codex executable path in Settings and make sure Codex is installed on this machine.",
      technicalDetail
    );
  }

  if (code === "EACCES" || normalizedDetail.includes("permission denied")) {
    return createFailure(
      "permission-denied",
      "Codex could not be started because this machine denied access to the executable or project folder. Check file permissions, then try again.",
      technicalDetail
    );
  }

  if (normalizedDetail.includes("pty") || normalizedDetail.includes("xterm")) {
    return createFailure(
      "pty-start-failed",
      "The terminal session could not be created for Codex. Restart the local server and try again.",
      technicalDetail
    );
  }

  return createFailure(
    "unknown",
    "Codex could not be started. Check the folder path and local Codex setup, then try again.",
    technicalDetail
  );
}

export function classifySessionExit(
  exitCode: number,
  signal: number,
  recentOutput: string,
  repoPath: string | null
): SessionFailurePayload | null {
  if (exitCode === 0) {
    return null;
  }

  const normalizedOutput = recentOutput.toLowerCase();
  const repoTarget = repoPath && repoPath.trim().length > 0 ? repoPath : "the selected project folder";
  const technicalDetail = recentOutput.trim().length > 0 ? recentOutput.trim() : `exit ${exitCode}, signal ${signal}`;

  if (
    normalizedOutput.includes("bubblewrap") ||
    normalizedOutput.includes("user namespace") ||
    normalizedOutput.includes("sandbox")
  ) {
    return createFailure(
      "sandbox-unavailable",
      `Codex could not finish starting its Linux sandbox for ${repoTarget}. Make sure bubblewrap is installed and that this Linux host allows the required user namespace setup.`,
      technicalDetail
    );
  }

  if (normalizedOutput.includes("permission denied")) {
    return createFailure(
      "permission-denied",
      `Codex stopped because access was denied while working in ${repoTarget}. Check project permissions and the Codex executable permissions, then try again.`,
      technicalDetail
    );
  }

  return createFailure(
    "process-exited-unexpectedly",
    `Codex stopped unexpectedly while working in ${repoTarget}. Review the technical details below, then retry the session once the underlying problem is fixed.`,
    technicalDetail
  );
}

export function formatTechnicalDetail(detail: string): string {
  return detail.trim().replace(/\s+/g, " ").slice(0, 400);
}
