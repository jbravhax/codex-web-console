import { type ReactNode, useEffect, useState } from "react";
import { formatAttachmentSize } from "./attachments";
import type {
  ComposerPanelProps,
  ConsoleHeaderProps,
  ConsoleViewProps,
  PendingContextPanelProps,
  ProjectControlsProps,
  RepoInsightsPanelProps,
  SessionHistoryPanelProps
} from "./app-types";
import type { PendingContextItem } from "./pending-context-types";
import { formatSessionBannerStateLabel, type SessionBanner } from "./session-banner";

type PendingContextGroup = {
  key: PendingContextItem["kind"];
  label: string;
  items: PendingContextItem[];
};

function groupPendingContextItems(items: PendingContextItem[]): PendingContextGroup[] {
  const groups: Array<{ key: PendingContextItem["kind"]; label: string }> = [
    { key: "generated-document", label: "Large pasted documents" },
    { key: "file", label: "Uploaded files" },
    { key: "image", label: "Pasted images" },
    { key: "zip", label: "ZIP uploads" }
  ];

  return groups
    .map((group) => ({
      ...group,
      items: items.filter((item) => item.kind === group.key)
    }))
    .filter((group) => group.items.length > 0);
}

function formatZipSkipReason(reason: string): string {
  switch (reason) {
    case "unsupported-type":
      return "unsupported or non-review file types";
    default:
      return reason.replace(/-/g, " ");
  }
}

function formatReadinessStatusLabel(status: "passed" | "warning" | "failed"): string {
  switch (status) {
    case "passed":
      return "Passed";
    case "warning":
      return "Warning";
    case "failed":
      return "Failed";
  }
}

function buildTerminalGuidance(sessionBanner: SessionBanner): string | null {
  if (sessionBanner.state === "awaiting-approval") {
    return "Codex is waiting for approval in the terminal. Approve in the terminal and work will continue automatically. Press Enter there to approve or Esc to cancel.";
  }

  if (sessionBanner.state === "awaiting-input") {
    return "Codex has reached a stopping point and is waiting for your next instruction. Use the prompt box below or type directly in the terminal to continue.";
  }

  if (sessionBanner.state === "completed") {
    return "The last request appears complete. Review the terminal result, then send another prompt when you're ready.";
  }

  if (sessionBanner.state === "running" || sessionBanner.state === "starting") {
    return "Codex is active in the terminal below. Keep an eye on it for progress, follow-up questions, or approval prompts.";
  }

  return null;
}

function formatTimestamp(timestamp: string | null): string | null {
  if (!timestamp) {
    return null;
  }

  return new Date(timestamp).toLocaleString();
}

function buildSessionMomentRows(
  sessionBanner: SessionBanner,
  sessionActivity: ConsoleHeaderProps["sessionActivity"]
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];

  const startedAt = formatTimestamp(sessionActivity.startedAt);
  if (startedAt && sessionBanner.state !== "idle" && sessionBanner.state !== "connecting") {
    rows.push({ label: "Started at", value: startedAt });
  }

  const lastActivityAt = formatTimestamp(sessionActivity.lastActivityAt);
  if (lastActivityAt && sessionBanner.state !== "idle" && sessionBanner.state !== "connecting") {
    rows.push({ label: "Last activity", value: lastActivityAt });
  }

  const completedAt = formatTimestamp(sessionActivity.completedAt);
  if (completedAt && sessionBanner.state === "completed") {
    rows.push({ label: "Completed at", value: completedAt });
  }

  const disconnectedAt = formatTimestamp(sessionActivity.disconnectedAt);
  if (disconnectedAt && sessionBanner.state === "disconnected") {
    rows.push({ label: "Disconnected at", value: disconnectedAt });
  }

  const failedAt = formatTimestamp(sessionActivity.failedAt);
  if (failedAt && sessionBanner.state === "failed") {
    rows.push({ label: "Failed at", value: failedAt });
  }

  return rows;
}

function formatWorkflowPhaseLabel(phase: ConsoleViewProps["workflowPhase"]): string {
  switch (phase) {
    case "project":
      return "Project";
    case "compose":
      return "Compose";
    case "live-run":
      return "Live Run";
    case "results":
      return "Results";
  }
}

function formatUtilityModeLabel(mode: ConsoleViewProps["utilityMode"]): string {
  switch (mode) {
    case "context":
      return "Context";
    case "history":
      return "History";
    case "transcript":
      return "Transcript";
    case "changes":
      return "Changes";
  }
}

function getSuggestedNextAction(sessionBanner: SessionBanner): string {
  switch (sessionBanner.state) {
    case "completed":
      return "Review the transcript or inspect repo changes, then send the next prompt when you are ready.";
    case "failed":
      return "Review the failure details and transcript, then start a fresh session once the issue is fixed.";
    case "disconnected":
      return "Reconnect to the local server and start a fresh session because live reattach is not available yet.";
    case "stopped":
      return "Review what happened in the transcript, then start a new session when you want to continue.";
    default:
      return "Review the session output, then choose the next action from the utility panel.";
  }
}

function formatElapsedDuration(startedAt: string | null, endedAt: string | null): string | null {
  if (!startedAt || !endedAt) {
    return null;
  }

  const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return null;
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

type CollapsibleSectionProps = {
  title: string;
  subtitle?: string;
  defaultExpanded?: boolean;
  children: ReactNode;
};

function CollapsibleSection({ title, subtitle, defaultExpanded = false, children }: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  useEffect(() => {
    if (defaultExpanded) {
      setIsExpanded(true);
    }
  }, [defaultExpanded]);

  return (
    <section className={`collapsible-section ${isExpanded ? "expanded" : ""}`}>
      <div className="collapsible-section-header">
        <div>
          <strong>{title}</strong>
          {subtitle ? <p className="helper-text collapsible-section-subtitle">{subtitle}</p> : null}
        </div>
        <button type="button" className="ghost collapsible-toggle" onClick={() => setIsExpanded((current) => !current)}>
          {isExpanded ? "Hide" : "Show"}
        </button>
      </div>
      {isExpanded ? <div className="collapsible-section-body">{children}</div> : null}
    </section>
  );
}

export function ConsoleHeader({ activeView, onChangeView, sessionBanner, sessionActivity }: ConsoleHeaderProps) {
  const sessionMoments = buildSessionMomentRows(sessionBanner, sessionActivity);

  return (
    <>
      <header className="page-header">
        <div className="page-header-copy">
          <p className="eyebrow">Local only</p>
          <h1>Codex CLI Web Console</h1>
          <p className="page-header-subtitle">A calm browser workspace for the Codex CLI running on this machine.</p>
        </div>
        <div className="header-actions">
          <div className="tab-row">
            <button
              type="button"
              className={activeView === "console" ? "tab-button active" : "tab-button secondary"}
              onClick={() => onChangeView("console")}
            >
              Console
            </button>
            <button
              type="button"
              className={activeView === "settings" ? "tab-button active" : "tab-button secondary"}
              onClick={() => onChangeView("settings")}
            >
              Settings
            </button>
          </div>
        </div>
      </header>

      <section className={`session-banner session-banner-${sessionBanner.state}`} aria-live="polite">
        <div className="session-banner-copy">
          <strong>{sessionBanner.title}</strong>
          <p>{sessionBanner.detail}</p>
          {sessionMoments.length > 0 ? (
            <div className="session-banner-metadata">
              {sessionMoments.map((row) => (
                <span key={row.label} className="session-banner-metadata-item">
                  <span className="session-banner-metadata-label">{row.label}</span>
                  <strong>{row.value}</strong>
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <span className="session-banner-state">{formatSessionBannerStateLabel(sessionBanner.state)}</span>
      </section>
    </>
  );
}

export function ProjectControls({
  status,
  repoPath,
  onRepoPathChange,
  onChooseRepo,
  repoPickerMessage,
  projectMessage,
  createProjectOptions,
  onCreateProjectOptionChange,
  onCreateProject,
  isCreatingProject,
  onStartSession,
  onStopSession,
  connectionStateLabel,
  defaultRepoRoot,
  isLoadingSettings,
  readiness,
  isLoadingReadiness,
  onRefreshReadiness,
  recentProjects,
  isLoadingRecentProjects
}: ProjectControlsProps) {
  const readinessSummary = !repoPath.trim()
    ? "Choose one project folder to run a quick check."
    : readiness
      ? `${formatReadinessStatusLabel(readiness.overallStatus)}. ${
          readiness.canStart ? "Ready to start." : "Needs attention before start."
        }`
      : "Quick check for Codex, Git, project access, and Linux sandbox readiness.";

  return (
    <section className="controls rail-card">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Workspace</p>
          <h2>Project</h2>
        </div>
        <span className="section-chip">{status.active ? "Active" : "Ready"}</span>
      </div>
      <label htmlFor="repo-path">Project folder path</label>
      <div className="repo-input-row">
        <input
          id="repo-path"
          type="text"
          value={repoPath}
          onChange={(event) => onRepoPathChange(event.target.value)}
          placeholder={defaultRepoRoot || "/home/you/project"}
        />
        <button type="button" className="secondary" onClick={onChooseRepo}>
          Choose folder
        </button>
      </div>
      <p className="helper-text">
        Paste one specific project path. Use the picker only when it can provide a usable folder path.
      </p>
      {repoPickerMessage ? <p className="helper-text repo-picker-message">{repoPickerMessage}</p> : null}
      <CollapsibleSection title="Environment readiness" subtitle={readinessSummary}>
        <div className="readiness-card">
          <div className="readiness-card-header">
            <div>
              <strong>Session preflight</strong>
            </div>
            <button type="button" className="ghost" onClick={onRefreshReadiness} disabled={!repoPath.trim() || isLoadingReadiness}>
              {isLoadingReadiness ? "Checking..." : "Refresh"}
            </button>
          </div>
          {!repoPath.trim() ? (
            <p className="helper-text">Enter one project folder to run readiness checks.</p>
          ) : isLoadingReadiness ? (
            <p className="helper-text">Checking Codex, Git, project access, and Linux sandbox readiness...</p>
          ) : readiness ? (
            <>
              <div className={`readiness-overall readiness-${readiness.overallStatus}`}>
                <strong>{formatReadinessStatusLabel(readiness.overallStatus)}</strong>
                <span>{readiness.canStart ? "This project can start a session." : "Fix the failed items below before starting a session."}</span>
              </div>
              <div className="readiness-list">
                {readiness.items.map((item) => (
                  <article key={item.key} className={`readiness-item readiness-${item.status}`}>
                    <div className="readiness-item-header">
                      <strong>{item.message}</strong>
                      <span className="section-chip">{formatReadinessStatusLabel(item.status)}</span>
                    </div>
                    <p className="helper-text">{item.recommendedAction}</p>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <p className="helper-text">Could not run readiness checks yet. Refresh after choosing a project folder.</p>
          )}
        </div>
      </CollapsibleSection>
      <div className="control-actions">
        <button
          type="button"
          className="primary-action-button"
          onClick={onStartSession}
          disabled={status.active || !repoPath.trim()}
        >
          Start session
        </button>
        <button type="button" onClick={onStopSession} disabled={!status.active} className="destructive">
          Stop session
        </button>
      </div>
      <div className="meta-row">
        <div className="meta-pill">
          <span className="meta-label">Server</span>
          <strong>{connectionStateLabel}</strong>
        </div>
        <div className="meta-pill">
          <span className="meta-label">Default repo root</span>
          <strong>{isLoadingSettings ? "Loading..." : defaultRepoRoot || "Choose a folder"}</strong>
        </div>
      </div>
      <CollapsibleSection
        title="Recent projects"
        subtitle={
          isLoadingRecentProjects
            ? "Loading recent projects..."
            : recentProjects.length === 0
              ? "Projects you open will appear here."
              : `${recentProjects.length} recent project${recentProjects.length === 1 ? "" : "s"} available.`
        }
      >
        <div className="recent-projects">
          {recentProjects.length > 0 ? (
            <div className="recent-project-list">
              {recentProjects.map((project) => (
                <button
                  key={project.repoPath}
                  type="button"
                  className={`recent-project-chip ${project.available ? "" : "unavailable"}`}
                  onClick={() => onRepoPathChange(project.repoPath)}
                  disabled={!project.available}
                >
                  <span className="recent-project-path">{project.repoPath}</span>
                  <span className="recent-project-meta">
                    {project.available ? `${project.openCount} open${project.openCount === 1 ? "" : "s"}` : "Unavailable"}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </CollapsibleSection>
      <div className="project-secondary-sections">
        <p className="section-divider-label">Or create a new project</p>
        <CollapsibleSection
          title="Create new project"
          subtitle="Use the path above only when you want the app to create a brand-new folder."
        >
          <div className="project-create-card">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={createProjectOptions.createFolder}
                onChange={(event) =>
                  onCreateProjectOptionChange({
                    ...createProjectOptions,
                    createFolder: event.target.checked
                  })
                }
              />
              <span>Create folder</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={createProjectOptions.initializeGit}
                onChange={(event) =>
                  onCreateProjectOptionChange({
                    ...createProjectOptions,
                    initializeGit: event.target.checked
                  })
                }
              />
              <span>Initialize Git repository</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={createProjectOptions.createReadme}
                onChange={(event) =>
                  onCreateProjectOptionChange({
                    ...createProjectOptions,
                    createReadme: event.target.checked
                  })
                }
              />
              <span>Create README.md</span>
            </label>
            <button
              type="button"
              className="secondary"
              onClick={onCreateProject}
              disabled={isCreatingProject || status.active || !repoPath.trim()}
            >
              {isCreatingProject ? "Creating project..." : "Create new project"}
            </button>
            {projectMessage ? <p className="success-banner compact-success">{projectMessage}</p> : null}
          </div>
        </CollapsibleSection>
      </div>
    </section>
  );
}

export function PendingContextPanel({
  pendingContextItems,
  readyPendingItemCount,
  pendingContextEmptyState,
  pendingContextPreviewLines,
  onClearAll,
  onCopyRelativePath,
  onRemoveAttachment
}: PendingContextPanelProps) {
  const groupedItems = groupPendingContextItems(pendingContextItems);

  return (
    <section className="context-card utility-surface">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Context</p>
          <h2>Ready context</h2>
        </div>
        <button type="button" className="ghost" onClick={onClearAll} disabled={pendingContextItems.length === 0}>
          Clear all
        </button>
      </div>
      <p className="pending-context-subtitle">
        {readyPendingItemCount > 0
          ? `${readyPendingItemCount} context item${readyPendingItemCount === 1 ? "" : "s"} will be included with the next prompt.`
          : pendingContextItems.length > 0
            ? "Context is still being prepared."
            : pendingContextEmptyState}
      </p>
      {pendingContextItems.length === 0 ? (
        <p className="empty-context">
          Nothing is queued yet. Large pasted text becomes a local markdown file reference, and attachments stay local
          inside the active repo.
        </p>
      ) : (
        <div className="attachment-groups">
          {groupedItems.map((group) => (
            <section className="attachment-group" key={group.key}>
              <div className="attachment-group-header">
                <strong>{group.label}</strong>
                <span className="section-chip">{group.items.length}</span>
              </div>
              <div className="attachment-list">
                {group.items.map((item) => (
                  <article
                    className={`attachment-chip ${item.warningText ? "warning" : ""} ${
                      item.uploadState === "uploading" ? "uploading" : ""
                    }`}
                    key={item.id}
                  >
                    <div className="attachment-main">
                      <div className="attachment-title-row">
                        <strong className="attachment-title">
                          <span className="attachment-icon" aria-hidden="true">
                            {item.icon}
                          </span>
                          {item.name}
                        </strong>
                        <div className="attachment-badges compact">
                          <span className="attachment-badge">{item.typeLabel}</span>
                          <span className={`attachment-badge ${item.uploadState === "ready" ? "ready" : "uploading"}`}>
                            {item.uploadState === "ready" ? "Ready" : "Uploading"}
                          </span>
                        </div>
                      </div>
                      <div className="attachment-meta-line">
                        <span>
                          {item.kind === "generated-document"
                            ? `${item.sizeBytes.toLocaleString()} characters`
                            : formatAttachmentSize(item.sizeBytes)}
                        </span>
                        {item.warningText ? <span className="attachment-inline-warning">Skipped files inside ZIP</span> : null}
                      </div>
                      <span className="attachment-path">{item.relativePath || item.detailLine}</span>
                      {item.relativePath ? <span className="attachment-detail">{item.detailLine}</span> : null}
                      {item.kind === "zip" && item.extractedFolderRelativePath ? (
                        <div className="zip-summary">
                          <span className="attachment-detail">Extracted folder: {item.extractedFolderRelativePath}/</span>
                          {item.skippedReasonCounts && Object.keys(item.skippedReasonCounts).length > 0 ? (
                            <span className="attachment-detail">
                              Skipped reasons:{" "}
                              {Object.entries(item.skippedReasonCounts)
                                .map(([reason, count]) => `${count} ${formatZipSkipReason(reason)}`)
                                .join(", ")}
                            </span>
                          ) : null}
                          {item.treePreview && item.treePreview.length > 0 ? (
                            <details className="zip-tree-preview">
                              <summary>Preview extracted tree</summary>
                              <pre>{item.treePreview.join("\n")}</pre>
                            </details>
                          ) : null}
                        </div>
                      ) : null}
                      {item.uploadState === "uploading" && item.progressPercent !== null ? (
                        <div className="progress-group">
                          <span className="progress-text">Uploading... {item.progressPercent}%</span>
                          <div className="progress-bar" aria-hidden="true">
                            <div className="progress-bar-fill" style={{ width: `${item.progressPercent}%` }} />
                          </div>
                        </div>
                      ) : null}
                      {item.warningText ? <span className="warning-text">Warning: {item.warningText}</span> : null}
                    </div>
                    <div className="attachment-buttons">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          onCopyRelativePath(item.relativePath);
                        }}
                        disabled={!item.relativePath || item.uploadState !== "ready"}
                      >
                        Copy path
                      </button>
                      <button
                        type="button"
                        className="ghost destructive-text"
                        onClick={() => onRemoveAttachment(item.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {pendingContextPreviewLines.length > 0 ? (
        <div className="context-preview">
          <strong>Pending context summary</strong>
          <ul className="context-preview-list">
            {pendingContextPreviewLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function ComposerPanel({
  status,
  sessionBanner,
  promptText,
  onPromptTextChange,
  onPromptPaste,
  onDrop,
  onFileSelection,
  fileInputRef,
  promptInputRef,
  promptPreviewSummary,
  promptPreviewSections,
  generatedPromptPreview,
  isPromptPreviewExpanded,
  onTogglePromptPreview,
  onCopyPromptPreview,
  onSendPrompt,
  contextMessage
}: ComposerPanelProps) {
  const terminalGuidance = buildTerminalGuidance(sessionBanner);

  return (
    <section
      className="prompt-panel workspace-card composer-card"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        void onDrop(event);
      }}
    >
      <div className="composer-header">
        <div>
          <p className="section-kicker">Prompt</p>
          <h2>Guide Codex intentionally</h2>
          <p className="helper-text">Write the task, add context if needed, and send it when you are ready.</p>
          {terminalGuidance ? <p className="helper-text composer-guidance">{terminalGuidance}</p> : null}
        </div>
        <div className="attachment-actions">
          <button type="button" className="secondary" onClick={() => fileInputRef.current?.click()} disabled={!status.active}>
            Attach files
          </button>
          <span className="helper-text">Drop files here or paste an image into the prompt box.</span>
        </div>
      </div>
      <input
        ref={fileInputRef}
        className="hidden-input"
        type="file"
        multiple
        accept=".txt,.md,.json,.csv,.log,.xml,.yaml,.yml,.png,.jpg,.jpeg,.webp,.pdf,.zip"
        onChange={(event) => {
          void onFileSelection(event);
        }}
        disabled={!status.active}
      />
      <label htmlFor="prompt-input" className="composer-label">
        Prompt
      </label>
      <textarea
        id="prompt-input"
        ref={promptInputRef}
        value={promptText}
        onChange={(event) => onPromptTextChange(event.target.value)}
        onPaste={(event) => {
          void onPromptPaste(event);
        }}
        placeholder="Describe the task clearly. Large pasted text will be stored as a local markdown document instead of flooding the prompt."
        disabled={!status.active}
        className="prompt-textarea"
      />
      <div className="prompt-preview-panel">
        <div className="prompt-preview-header">
          <div>
            <strong>What Codex will receive</strong>
            {isPromptPreviewExpanded ? (
              <p className="helper-text">This is the exact prompt that will be sent, including saved context references.</p>
            ) : null}
          </div>
          <div className="prompt-preview-actions">
            <button type="button" className="ghost" onClick={onTogglePromptPreview}>
              {isPromptPreviewExpanded ? "Hide preview" : "Show preview"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={onCopyPromptPreview}
              disabled={!generatedPromptPreview.trim()}
            >
              Copy preview
            </button>
          </div>
        </div>
        <p className="prompt-preview-summary">{promptPreviewSummary}</p>
        {isPromptPreviewExpanded ? (
          <div className="prompt-preview-body">
            {promptPreviewSections.length > 0 ? (
              <div className="prompt-preview-sections">
                {promptPreviewSections.map((section) => (
                  <article className="prompt-preview-section" key={section.label}>
                    <strong>{section.label}</strong>
                    <pre>{section.lines.join("\n")}</pre>
                  </article>
                ))}
              </div>
            ) : (
              <div className="prompt-preview-empty-state">
                <strong>Nothing queued yet</strong>
                <p>Add a typed prompt, pasted document, file, image, or ZIP to see the exact message before sending it.</p>
              </div>
            )}
            <article className="prompt-preview-section prompt-preview-full">
              <strong>Full generated prompt</strong>
              <pre>{generatedPromptPreview || "Nothing will be sent yet. Add a prompt or context to build the final message."}</pre>
            </article>
          </div>
        ) : null}
      </div>
      <div className="prompt-actions">
        <button type="button" onClick={onSendPrompt} disabled={!status.active}>
          Send prompt
        </button>
        <span className="helper-text">
          Short pasted text stays inline. Large pasted text becomes a local context file.
        </span>
      </div>
      {contextMessage ? <p className="success-banner">{contextMessage}</p> : null}
    </section>
  );
}

export function RepoInsightsPanel({
  status,
  gitStatus,
  isLoadingGitStatus,
  diffViewer,
  diffPanelText,
  diffEmptyState,
  onViewDiff,
  onCopyDiff
}: RepoInsightsPanelProps) {
  const hasDiffState = diffViewer.isLoading || Boolean(diffViewer.error) || Boolean(diffViewer.diff) || Boolean(diffEmptyState);

  return (
    <section className="git-section utility-surface">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Repository</p>
          <h2>Changes</h2>
        </div>
        <span className="section-chip">{status.active ? "Live" : "Idle"}</span>
      </div>
      {status.active ? (
        <div className="git-actions">
          <button type="button" className="ghost" onClick={onViewDiff}>
            Inspect changes
          </button>
        </div>
      ) : null}
      {!status.active ? <p className="git-empty">Start a session to inspect repo changes.</p> : null}
      {status.active ? (
        <CollapsibleSection
          title="Repo details"
          subtitle={
            isLoadingGitStatus
              ? "Loading repo status..."
              : gitStatus?.isGitRepo
                ? `Branch ${gitStatus.branch || "Unknown"} · ${gitStatus.changedFilesCount} changed · ${gitStatus.stagedFilesCount} staged · ${gitStatus.untrackedFilesCount} untracked`
                : gitStatus?.message || "This folder is not a Git repository."
          }
          defaultExpanded={hasDiffState}
        >
          <>
            {isLoadingGitStatus ? <p className="git-empty">Loading repo status...</p> : null}
            {!isLoadingGitStatus && gitStatus ? (
              gitStatus.isGitRepo ? (
                <div className="git-stats">
                  <article className="git-stat-card">
                    <span className="git-stat-label">Branch</span>
                    <strong>{gitStatus.branch || "Unknown"}</strong>
                  </article>
                  <article className="git-stat-card">
                    <span className="git-stat-label">Changed files</span>
                    <strong>{gitStatus.changedFilesCount}</strong>
                  </article>
                  <article className="git-stat-card">
                    <span className="git-stat-label">Staged files</span>
                    <strong>{gitStatus.stagedFilesCount}</strong>
                  </article>
                  <article className="git-stat-card">
                    <span className="git-stat-label">Untracked files</span>
                    <strong>{gitStatus.untrackedFilesCount}</strong>
                  </article>
                </div>
              ) : (
                <p className="git-empty">{gitStatus.message || "This folder is not a Git repository."}</p>
              )
            ) : null}
            {hasDiffState ? (
              <div className="diff-viewer">
                <div className="diff-header">
                  <h3>Current diff</h3>
                  <div className="diff-actions">
                    <button type="button" className="ghost" onClick={onCopyDiff} disabled={!diffPanelText}>
                      Copy diff
                    </button>
                  </div>
                </div>
                {diffViewer.isLoading ? <p className="git-empty">Loading diff...</p> : null}
                {!diffViewer.isLoading && diffViewer.error ? <p className="git-empty">{diffViewer.error}</p> : null}
                {!diffViewer.isLoading && !diffViewer.error && diffEmptyState ? <p className="git-empty">{diffEmptyState}</p> : null}
                {!diffViewer.isLoading && !diffViewer.error && diffPanelText ? <pre className="diff-panel">{diffPanelText}</pre> : null}
              </div>
            ) : null}
          </>
        </CollapsibleSection>
      ) : null}
    </section>
  );
}

export function SessionHistoryPanel({
  sessions,
  isLoadingSessions,
  transcriptViewer,
  showTranscriptViewer = true,
  onViewTranscript,
  onCopyTranscript,
  onDownloadTranscriptText,
  onDownloadTranscriptMarkdown,
  onDownloadRawTranscript,
  formatDuration
}: SessionHistoryPanelProps) {
  return (
    <section className="history-section utility-surface">
      <div className="section-heading">
        <div>
          <p className="section-kicker">History</p>
          <h2>Session history</h2>
        </div>
        <span className="section-chip">{sessions.length}</span>
      </div>
      <div className="history-list">
        {isLoadingSessions ? <p className="history-empty">Loading recent sessions...</p> : null}
        {!isLoadingSessions && sessions.length === 0 ? <p className="history-empty">No saved sessions yet.</p> : null}
        {sessions.map((session) => (
          <article className="history-item" key={session.id}>
            <p className="history-repo">{session.repoPath}</p>
            <p className="history-meta">
              <span>{new Date(session.startTime).toLocaleString()}</span>
              <span>{formatDuration(session.durationMs)}</span>
            </p>
            <div className="history-actions">
              <button type="button" className="ghost" onClick={() => onViewTranscript(session)}>
                View transcript
              </button>
            </div>
          </article>
        ))}
      </div>
      {showTranscriptViewer && transcriptViewer.session ? (
        <div className="transcript-viewer">
          <div className="transcript-header">
            <div>
              <h3>Transcript</h3>
              <p className="history-repo">{transcriptViewer.session.repoPath}</p>
              <p className="history-meta">
                <span>{new Date(transcriptViewer.session.startTime).toLocaleString()}</span>
                <span>
                  {transcriptViewer.session.endTime
                    ? new Date(transcriptViewer.session.endTime).toLocaleString()
                    : "In progress"}
                </span>
                <span>{formatDuration(transcriptViewer.session.durationMs)}</span>
              </p>
            </div>
          </div>
          <div className="transcript-export-actions">
            <button
              type="button"
              className="ghost"
              onClick={onCopyTranscript}
              disabled={!transcriptViewer.transcript}
            >
              Copy transcript
            </button>
            <button
              type="button"
              className="ghost"
              onClick={onDownloadTranscriptText}
              disabled={!transcriptViewer.transcript}
            >
              Download .txt
            </button>
            <button
              type="button"
              className="ghost"
              onClick={onDownloadTranscriptMarkdown}
              disabled={!transcriptViewer.transcript}
            >
              Download .md
            </button>
            <button
              type="button"
              className="ghost"
              onClick={onDownloadRawTranscript}
              disabled={transcriptViewer.isLoading || !transcriptViewer.session}
            >
              Download raw
            </button>
          </div>
          {transcriptViewer.isLoading ? <p className="history-empty">Loading transcript...</p> : null}
          {!transcriptViewer.isLoading && transcriptViewer.error ? <p className="history-empty">{transcriptViewer.error}</p> : null}
          {!transcriptViewer.isLoading && !transcriptViewer.error ? (
            <pre className="transcript-panel">{transcriptViewer.transcript || "Transcript is empty."}</pre>
          ) : null}
        </div>
      ) : showTranscriptViewer ? (
        <div className="transcript-empty-state">
          <strong>No transcript yet</strong>
          <p>Open a recent session to review its transcript here.</p>
        </div>
      ) : null}
    </section>
  );
}

function ResultsSummaryCard({
  sessionBanner,
  sessionActivity,
  latestSession,
  repoInsightsPanel,
  onOpenTranscript,
  onOpenChanges,
  formatDuration
}: {
  sessionBanner: ConsoleViewProps["sessionBanner"];
  sessionActivity: ConsoleViewProps["sessionActivity"];
  latestSession: ConsoleViewProps["latestSession"];
  repoInsightsPanel: ConsoleViewProps["repoInsightsPanel"];
  onOpenTranscript(): void;
  onOpenChanges(): void;
  formatDuration(durationMs: number | null): string;
}) {
  const endedAt =
    sessionActivity.completedAt ||
    sessionActivity.failedAt ||
    sessionActivity.disconnectedAt ||
    sessionActivity.lastActivityAt;
  const duration =
    latestSession?.durationMs !== null && latestSession?.durationMs !== undefined
      ? formatDuration(latestSession.durationMs)
      : formatElapsedDuration(sessionActivity.startedAt, endedAt);
  const transcriptAvailable = Boolean(latestSession);
  const changesAvailable = Boolean(
    repoInsightsPanel.diffPanelText ||
      repoInsightsPanel.diffEmptyState ||
      (repoInsightsPanel.gitStatus &&
        (repoInsightsPanel.gitStatus.changedFilesCount > 0 ||
          repoInsightsPanel.gitStatus.stagedFilesCount > 0 ||
          repoInsightsPanel.gitStatus.untrackedFilesCount > 0))
  );

  return (
    <section className="results-summary-card workspace-card">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Results</p>
          <h2>{sessionBanner.title}</h2>
        </div>
        <span className="section-chip">{formatSessionBannerStateLabel(sessionBanner.state)}</span>
      </div>
      <p className="results-summary-copy">{sessionBanner.detail}</p>
      <div className="results-summary-grid">
        <article className="meta-pill">
          <span className="meta-label">Completed at</span>
          <strong>{endedAt ? new Date(endedAt).toLocaleString() : "Waiting for final output"}</strong>
        </article>
        <article className="meta-pill">
          <span className="meta-label">Duration</span>
          <strong>{duration || "Not available yet"}</strong>
        </article>
        <article className="meta-pill">
          <span className="meta-label">Last activity</span>
          <strong>
            {sessionActivity.lastActivityAt ? new Date(sessionActivity.lastActivityAt).toLocaleString() : "Not available"}
          </strong>
        </article>
        <article className="meta-pill">
          <span className="meta-label">Repo changes</span>
          <strong>{changesAvailable ? "Available to inspect" : "No changes detected yet"}</strong>
        </article>
      </div>
      <div className="results-summary-status-list">
        <span className={`summary-pill ${transcriptAvailable ? "ready" : "muted"}`}>
          {transcriptAvailable ? "Transcript available" : "Transcript not ready yet"}
        </span>
        <span className={`summary-pill ${changesAvailable ? "ready" : "muted"}`}>
          {changesAvailable ? "Changes available" : "No changes available"}
        </span>
      </div>
      <div className="results-summary-actions">
        <button type="button" className="secondary" onClick={onOpenTranscript} disabled={!transcriptAvailable}>
          Open transcript
        </button>
        <button type="button" className="ghost" onClick={onOpenChanges}>
          Inspect changes
        </button>
      </div>
      <p className="helper-text results-next-step">
        <strong>Next step:</strong> {getSuggestedNextAction(sessionBanner)}
      </p>
    </section>
  );
}

function UtilityPanel({
  utilityMode,
  onUtilityModeChange,
  pendingContextPanel,
  repoInsightsPanel,
  sessionHistoryPanel
}: {
  utilityMode: ConsoleViewProps["utilityMode"];
  onUtilityModeChange(nextMode: ConsoleViewProps["utilityMode"]): void;
  pendingContextPanel: ConsoleViewProps["pendingContextPanel"];
  repoInsightsPanel: ConsoleViewProps["repoInsightsPanel"];
  sessionHistoryPanel: ConsoleViewProps["sessionHistoryPanel"];
}) {
  const utilityTabButtons = (["context", "history", "transcript", "changes"] as const).map((mode) => (
    <button
      key={mode}
      type="button"
      role="tab"
      aria-selected={utilityMode === mode}
      className={utilityMode === mode ? "utility-tab active" : "utility-tab"}
      onClick={() => onUtilityModeChange(mode)}
    >
      {formatUtilityModeLabel(mode)}
    </button>
  ));

  return (
    <section className="utility-panel rail-card">
      <div className="section-heading utility-panel-heading">
        <div>
          <p className="section-kicker">Utilities</p>
          <h2>{formatUtilityModeLabel(utilityMode)}</h2>
        </div>
      </div>
      <div className="utility-mode-tabs" role="tablist" aria-label="Utility panels">
        {utilityTabButtons}
      </div>
      <div className="utility-panel-body">
        {utilityMode === "context" ? <PendingContextPanel {...pendingContextPanel} /> : null}
        {utilityMode === "changes" ? <RepoInsightsPanel {...repoInsightsPanel} /> : null}
        {utilityMode === "history" ? <SessionHistoryPanel {...sessionHistoryPanel} showTranscriptViewer={false} /> : null}
        {utilityMode === "transcript" ? <SessionHistoryPanel {...sessionHistoryPanel} showTranscriptViewer /> : null}
      </div>
    </section>
  );
}

export function ConsoleView({
  projectControls,
  pendingContextPanel,
  composerPanel,
  repoInsightsPanel,
  sessionHistoryPanel,
  workflowPhase,
  utilityMode,
  onUtilityModeChange,
  status,
  sessionBanner,
  sessionActivity,
  latestSession,
  terminalContainerRef
}: ConsoleViewProps) {
  const terminalGuidance = buildTerminalGuidance(sessionBanner);
  const showResultsSummary = workflowPhase === "results";

  return (
    <div className={`console-layout workflow-${workflowPhase}`}>
      <aside className="control-rail">
        <ProjectControls {...projectControls} />
      </aside>

      <main className="workspace-main">
        <ComposerPanel {...composerPanel} />
        {showResultsSummary ? (
          <ResultsSummaryCard
            sessionBanner={sessionBanner}
            sessionActivity={sessionActivity}
            latestSession={latestSession}
            repoInsightsPanel={repoInsightsPanel}
            onOpenTranscript={() => onUtilityModeChange("transcript")}
            onOpenChanges={() => onUtilityModeChange("changes")}
            formatDuration={sessionHistoryPanel.formatDuration}
          />
        ) : null}

        <section className="terminal-section workspace-card">
          <div
            className={`terminal-stage ${sessionBanner.state === "awaiting-approval" ? "terminal-stage-attention" : ""} ${
              sessionBanner.state === "failed" || sessionBanner.state === "disconnected" ? "terminal-stage-muted" : ""
            }`}
            data-session-state={sessionBanner.state}
          >
            <div className="terminal-stage-header">
              <div>
                <p className="section-kicker">Console</p>
                <h2>Live Codex terminal</h2>
              </div>
              <div className="terminal-stage-meta">
                <span className="section-chip">{status.active ? formatSessionBannerStateLabel(sessionBanner.state) : "Waiting"}</span>
                <span className="section-chip workflow-phase-chip">{formatWorkflowPhaseLabel(workflowPhase)}</span>
              </div>
            </div>
            {terminalGuidance ? <p className="terminal-guidance">{terminalGuidance}</p> : null}
            <div ref={terminalContainerRef} className="terminal-panel" />
          </div>
        </section>
      </main>

      <aside className="insights-rail utility-rail">
        <UtilityPanel
          utilityMode={utilityMode}
          onUtilityModeChange={onUtilityModeChange}
          pendingContextPanel={pendingContextPanel}
          repoInsightsPanel={repoInsightsPanel}
          sessionHistoryPanel={sessionHistoryPanel}
        />
      </aside>
    </div>
  );
}
