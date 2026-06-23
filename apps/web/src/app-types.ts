import type React from "react";
import type { PendingContextItem } from "./pending-context-types";
import type { GitDiffSummary } from "./git-diff-viewer";
import type { SessionBanner } from "./session-banner";
import type { SessionExitPayload, SessionFailurePayload } from "./session-diagnostics";
import type { UtilityMode, WorkspaceState } from "./workflow-phase";

export type ConsolePage = "workspace" | "project" | UtilityMode;

export type ThemeSetting = "light" | "dark";

export type SessionStatus = {
  active: boolean;
  repoPath: string | null;
  startedAt: string | null;
};

export type SessionActivitySummary = {
  startedAt: string | null;
  lastActivityAt: string | null;
  completedAt: string | null;
  disconnectedAt: string | null;
  failedAt: string | null;
};

export type CreateProjectOptions = {
  createFolder: boolean;
  initializeGit: boolean;
  createReadme: boolean;
};

export type CreateProjectResponse = {
  repoPath: string;
  createdFolder: boolean;
  initializedGit: boolean;
  createdReadme: boolean;
  message: string;
};

export type SessionHistoryItem = {
  id: string;
  repoPath: string;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
};

export type TranscriptViewerState = {
  session: SessionHistoryItem | null;
  transcript: string;
  rawTranscript: string;
  isLoading: boolean;
  error: string;
};

export type DiffViewerState = {
  diff: GitDiffSummary | null;
  isLoading: boolean;
  error: string;
};

export type RecentProjectItem = {
  repoPath: string;
  lastOpenedAt: string;
  openCount: number;
  available: boolean;
};

export type AppSettings = {
  codexExecutablePath: string;
  defaultRepoRoot: string;
  serverBindHost: string;
  serverPort: number;
  theme: ThemeSetting;
};

export type ReadinessCheckStatus = "passed" | "warning" | "failed";

export type ReadinessCheck = {
  key:
    | "codex-executable"
    | "git-executable"
    | "project-folder"
    | "project-access"
    | "bubblewrap"
    | "user-namespaces";
  status: ReadinessCheckStatus;
  message: string;
  recommendedAction: string;
};

export type ReadinessSummary = {
  overallStatus: ReadinessCheckStatus;
  canStart: boolean;
  checkedAt: string;
  repoPath: string;
  items: ReadinessCheck[];
};

export type GitStatusSummary = {
  repoPath: string;
  isGitRepo: boolean;
  branch: string | null;
  changedFilesCount: number;
  stagedFilesCount: number;
  untrackedFilesCount: number;
  message?: string;
};

export type ServerMessage =
  | { type: "status"; payload: SessionStatus }
  | { type: "output"; payload: string }
  | { type: "exit"; payload: SessionExitPayload }
  | { type: "error"; payload: string | SessionFailurePayload };

export type ProjectControlsProps = {
  status: SessionStatus;
  repoPath: string;
  onRepoPathChange(nextPath: string): void;
  onChooseRepo(): void;
  repoPickerMessage: string;
  projectMessage: string;
  createProjectOptions: CreateProjectOptions;
  onCreateProjectOptionChange(nextOptions: CreateProjectOptions): void;
  onCreateProject(): void;
  isCreatingProject: boolean;
  onStartSession(): void;
  onStopSession(): void;
  connectionStateLabel: string;
  defaultRepoRoot: string;
  isLoadingSettings: boolean;
  readiness: ReadinessSummary | null;
  isLoadingReadiness: boolean;
  onRefreshReadiness(): void;
  recentProjects: RecentProjectItem[];
  isLoadingRecentProjects: boolean;
};

export type PendingContextPanelProps = {
  pendingContextItems: PendingContextItem[];
  readyPendingItemCount: number;
  pendingContextEmptyState: string;
  pendingContextPreviewLines: string[];
  onClearAll(): void;
  onCopyRelativePath(relativePath: string): void;
  onRemoveAttachment(id: string): void;
};

export type ComposerPanelProps = {
  status: SessionStatus;
  sessionBanner: SessionBanner;
  promptText: string;
  onPromptTextChange(nextPrompt: string): void;
  onPromptPaste(content: React.ClipboardEvent<HTMLTextAreaElement>): void | Promise<void>;
  onDrop(event: React.DragEvent<HTMLElement>): void | Promise<void>;
  onFileSelection(event: React.ChangeEvent<HTMLInputElement>): void | Promise<void>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  promptInputRef: React.RefObject<HTMLTextAreaElement | null>;
  promptPreviewSummary: string;
  promptPreviewSections: Array<{ label: string; lines: string[] }>;
  generatedPromptPreview: string;
  isPromptPreviewExpanded: boolean;
  onTogglePromptPreview(): void;
  onCopyPromptPreview(): void;
  onSendPrompt(): void;
};

export type RepoInsightsPanelProps = {
  status: SessionStatus;
  gitStatus: GitStatusSummary | null;
  isLoadingGitStatus: boolean;
  diffViewer: DiffViewerState;
  diffPanelText: string;
  diffEmptyState: string;
  onViewDiff(): void;
  onCopyDiff(): void;
};

export type SessionHistoryPanelProps = {
  sessions: SessionHistoryItem[];
  isLoadingSessions: boolean;
  transcriptViewer: TranscriptViewerState;
  showTranscriptViewer?: boolean;
  onViewTranscript(session: SessionHistoryItem): void;
  onCopyTranscript(): void;
  onDownloadTranscriptText(): void;
  onDownloadTranscriptMarkdown(): void;
  onDownloadRawTranscript(): void;
  formatDuration(durationMs: number | null): string;
};

export type ConsoleViewProps = {
  projectControls: ProjectControlsProps;
  pendingContextPanel: PendingContextPanelProps;
  composerPanel: ComposerPanelProps;
  repoInsightsPanel: RepoInsightsPanelProps;
  sessionHistoryPanel: SessionHistoryPanelProps;
  page: ConsolePage;
  workspaceState: WorkspaceState;
  onSelectPage(nextPage: ConsolePage): void;
  status: SessionStatus;
  sessionBanner: SessionBanner;
  sessionActivity: SessionActivitySummary;
  latestSession: SessionHistoryItem | null;
  terminalContainerRef: React.RefCallback<HTMLDivElement>;
};

export type ConsoleHeaderProps = {
  activeView: "console" | "settings";
  onChangeView(nextView: "console" | "settings"): void;
  sessionBanner: SessionBanner;
  sessionActivity: SessionActivitySummary;
  connectionStateLabel: string;
  hasActiveSession: boolean;
};
