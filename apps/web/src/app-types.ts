import type React from "react";
import type { PendingContextItem } from "./pending-context-types";
import type { GitDiffSummary } from "./git-diff-viewer";
import type { SessionBanner } from "./session-banner";

export type ThemeSetting = "light" | "dark";

export type SessionStatus = {
  active: boolean;
  repoPath: string | null;
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
  | { type: "exit"; payload: { exitCode: number; signal: number } }
  | { type: "error"; payload: string };

export type ProjectControlsProps = {
  status: SessionStatus;
  repoPath: string;
  onRepoPathChange(nextPath: string): void;
  onChooseRepo(): void;
  repoPickerMessage: string;
  onStartSession(): void;
  onStopSession(): void;
  connectionStateLabel: string;
  defaultRepoRoot: string;
  isLoadingSettings: boolean;
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
  contextMessage: string;
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
  onViewTranscript(session: SessionHistoryItem): void;
  onCopyTranscript(): void;
  formatDuration(durationMs: number | null): string;
};

export type ConsoleViewProps = {
  projectControls: ProjectControlsProps;
  pendingContextPanel: PendingContextPanelProps;
  composerPanel: ComposerPanelProps;
  repoInsightsPanel: RepoInsightsPanelProps;
  sessionHistoryPanel: SessionHistoryPanelProps;
  status: SessionStatus;
  terminalContainerRef: React.RefObject<HTMLDivElement | null>;
};

export type ConsoleHeaderProps = {
  activeView: "console" | "settings";
  onChangeView(nextView: "console" | "settings"): void;
  sessionBanner: SessionBanner;
};
