import type { SessionBannerState } from "./session-banner";

export type WorkflowPhase = "project" | "compose" | "live-run" | "results";
export type UtilityMode = "context" | "history" | "transcript" | "changes";

type WorkflowPhaseInput = {
  sessionBannerState: SessionBannerState;
  repoPath: string;
  promptText: string;
  readyPendingItemCount: number;
};

type UtilityModeInput = {
  workflowPhase: WorkflowPhase;
  readyPendingItemCount: number;
  hasTranscriptHistory: boolean;
  hasLoadedTranscript: boolean;
  hasRepoChanges: boolean;
};

const LIVE_RUN_STATES: SessionBannerState[] = [
  "starting",
  "running",
  "awaiting-approval",
  "awaiting-input",
  "stopping"
];

const RESULTS_STATES: SessionBannerState[] = ["completed", "stopped", "disconnected", "failed"];

export function deriveWorkflowPhase({
  sessionBannerState,
  repoPath,
  promptText,
  readyPendingItemCount
}: WorkflowPhaseInput): WorkflowPhase {
  if (LIVE_RUN_STATES.includes(sessionBannerState)) {
    return "live-run";
  }

  if (RESULTS_STATES.includes(sessionBannerState)) {
    return "results";
  }

  if (!repoPath.trim()) {
    return "project";
  }

  if (promptText.trim() || readyPendingItemCount > 0) {
    return "compose";
  }

  return "compose";
}

export function recommendUtilityMode({
  workflowPhase,
  readyPendingItemCount,
  hasTranscriptHistory,
  hasLoadedTranscript,
  hasRepoChanges
}: UtilityModeInput): UtilityMode {
  if (hasLoadedTranscript) {
    return "transcript";
  }

  if (workflowPhase === "results") {
    if (hasTranscriptHistory) {
      return "transcript";
    }

    return hasRepoChanges ? "changes" : "history";
  }

  if (workflowPhase === "live-run") {
    return hasRepoChanges ? "changes" : "history";
  }

  if (readyPendingItemCount > 0) {
    return "context";
  }

  if (hasTranscriptHistory) {
    return "history";
  }

  return workflowPhase === "project" ? "history" : "context";
}
