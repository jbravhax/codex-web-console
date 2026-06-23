import type { SessionBannerState } from "./session-banner";

export type AppSurface = "project" | "workspace";
export type WorkspaceState =
  | "idle"
  | "ready-to-compose"
  | "running"
  | "awaiting-approval"
  | "awaiting-input"
  | "completed"
  | "failed"
  | "disconnected"
  | "stopped";
export type WorkspaceSection = "compose" | "live-run" | "results";
export type UtilityMode = "context" | "transcript" | "changes";

type WorkspaceStateInput = {
  sessionBannerState: SessionBannerState;
  promptText: string;
  readyPendingItemCount: number;
};

type UtilityModeInput = {
  surface: AppSurface;
  workspaceState: WorkspaceState;
  readyPendingItemCount: number;
  hasTranscriptHistory: boolean;
  hasLoadedTranscript: boolean;
  hasRepoChanges: boolean;
};

const RUNNING_STATES: SessionBannerState[] = ["starting", "running", "stopping"];
const RESULT_STATES: WorkspaceState[] = ["completed", "stopped", "disconnected", "failed"];
const LIVE_RUN_STATES: WorkspaceState[] = ["running", "awaiting-approval", "awaiting-input"];

export function isLiveRunWorkspaceState(workspaceState: WorkspaceState): boolean {
  return LIVE_RUN_STATES.includes(workspaceState);
}

export function isResultsWorkspaceState(workspaceState: WorkspaceState): boolean {
  return RESULT_STATES.includes(workspaceState);
}

export function deriveWorkspaceState({
  sessionBannerState,
  promptText,
  readyPendingItemCount
}: WorkspaceStateInput): WorkspaceState {
  if (RUNNING_STATES.includes(sessionBannerState)) {
    return "running";
  }

  if (sessionBannerState === "awaiting-approval") {
    return "awaiting-approval";
  }

  if (sessionBannerState === "awaiting-input") {
    return "awaiting-input";
  }

  if (
    sessionBannerState === "completed" ||
    sessionBannerState === "failed" ||
    sessionBannerState === "disconnected" ||
    sessionBannerState === "stopped"
  ) {
    return sessionBannerState;
  }

  if (promptText.trim() || readyPendingItemCount > 0) {
    return "ready-to-compose";
  }

  return "idle";
}

export function recommendUtilityMode({
  surface,
  workspaceState,
  readyPendingItemCount,
  hasTranscriptHistory,
  hasLoadedTranscript,
  hasRepoChanges
}: UtilityModeInput): UtilityMode {
  if (hasLoadedTranscript) {
    return "transcript";
  }

  if (isResultsWorkspaceState(workspaceState)) {
    if (hasTranscriptHistory) {
      return "transcript";
    }

    return hasRepoChanges ? "changes" : "transcript";
  }

  if (isLiveRunWorkspaceState(workspaceState)) {
    return hasRepoChanges ? "changes" : "transcript";
  }

  if (readyPendingItemCount > 0) {
    return "context";
  }

  if (hasTranscriptHistory) {
    return "transcript";
  }

  return surface === "project" ? "transcript" : "context";
}
