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

function formatLiveDuration(startedAt: string | null, endedAt?: string | null): string | null {
  if (!startedAt) {
    return null;
  }

  return formatElapsedDuration(startedAt, endedAt ?? new Date().toISOString());
}

function formatProjectTitle(repoPath: string, defaultRepoRoot: string): string {
  const normalizedPath = repoPath.trim() || defaultRepoRoot.trim();
  if (!normalizedPath) {
    return "Choose a project";
  }

  const pathParts = normalizedPath.split(/[/\\]/).filter(Boolean);
  return pathParts[pathParts.length - 1] ?? normalizedPath;
}

function buildProjectSubtitle(repoPath: string, defaultRepoRoot: string): string {
  const normalizedPath = repoPath.trim() || defaultRepoRoot.trim();
  return normalizedPath || "Paste a project path or use the folder picker.";
}

type CollapsibleSectionProps = {
  title: string;
  subtitle?: string;
  defaultExpanded?: boolean;
  className?: string;
  children: ReactNode;
};

function CollapsibleSection({
  title,
  subtitle,
  defaultExpanded = false,
  className,
  children
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  useEffect(() => {
    if (defaultExpanded) {
      setIsExpanded(true);
    }
  }, [defaultExpanded]);

  return (
    <section className={`collapsible-section ${isExpanded ? "expanded" : ""} ${className ?? ""}`.trim()}>
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

export function ConsoleHeader({
  activeView,
  onChangeView,
  sessionBanner,
  sessionActivity,
  onDisconnect,
  connectionStateLabel,
  hasActiveSession
}: ConsoleHeaderProps) {
  const sessionMoments = buildSessionMomentRows(sessionBanner, sessionActivity);
  const isExceptionalBannerState =
    sessionBanner.state === "awaiting-approval" ||
    sessionBanner.state === "awaiting-input" ||
    sessionBanner.state === "disconnected" ||
    sessionBanner.state === "failed";
  const liveDuration = formatLiveDuration(
    sessionActivity.startedAt,
    sessionActivity.completedAt ||
      sessionActivity.failedAt ||
      sessionActivity.disconnectedAt ||
      (sessionBanner.state === "idle" ? sessionActivity.startedAt : null)
  );
  const showApprovalBadge = sessionBanner.state === "awaiting-approval";
  const showRunningIndicator =
    sessionBanner.state === "running" || sessionBanner.state === "starting" || sessionBanner.state === "awaiting-approval";
  const showDisconnect = activeView === "console";

  return (
    <>
      <header className="top-status-bar">
        <div className="top-status-brand">
          <div className="traffic-lights" aria-hidden="true">
            <span className="traffic-light red" />
            <span className="traffic-light amber" />
            <span className="traffic-light green" />
          </div>
          <button
            type="button"
            className={activeView === "console" ? "app-switcher active" : "app-switcher secondary"}
            onClick={() => onChangeView("console")}
          >
            Console
          </button>
          <div className="page-header-copy">
            <h1>Codex Console</h1>
          </div>
        </div>
        <div className="top-status-center">
          <div className="top-status-chip">
            <span className="top-status-label">Session</span>
            <strong>{hasActiveSession ? sessionBanner.title : connectionStateLabel}</strong>
          </div>
          {showRunningIndicator ? (
            <div className="top-status-chip top-status-running">
              <span className="top-status-dot" aria-hidden="true" />
              <strong>Running</strong>
            </div>
          ) : null}
          {liveDuration ? (
            <div className="top-status-chip">
              <span className="top-status-label">Duration</span>
              <strong>{liveDuration}</strong>
            </div>
          ) : null}
          {showApprovalBadge ? (
            <div className="top-status-chip top-status-approval">
              <strong>Waiting for approval</strong>
            </div>
          ) : null}
        </div>
        <div className="header-actions top-status-actions">
          <button
            type="button"
            className={activeView === "settings" ? "app-switcher active" : "app-switcher secondary"}
            onClick={() => onChangeView("settings")}
          >
            Settings
          </button>
          {showDisconnect ? (
            <button type="button" className="disconnect-button" onClick={onDisconnect}>
              Disconnect
            </button>
          ) : null}
        </div>
      </header>

      <section
        className={`session-banner ${isExceptionalBannerState ? "session-banner-exception" : "session-banner-routine"} session-banner-${sessionBanner.state}`}
        aria-live="polite"
      >
        <div className="session-banner-copy">
          {isExceptionalBannerState ? <strong>{sessionBanner.title}</strong> : null}
          <p>{sessionBanner.detail}</p>
          {sessionMoments.length > 0 && (isExceptionalBannerState || sessionBanner.state === "completed") ? (
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
        {isExceptionalBannerState ? (
          <span className="session-banner-state">{formatSessionBannerStateLabel(sessionBanner.state)}</span>
        ) : null}
      </section>
    </>
  );
}

function ProjectRail({
  workflowPhase,
  workspaceView,
  onSelectWorkspaceView,
  projectTitle,
  projectSubtitle,
  readiness,
  recentProjectCount,
  readyPendingItemCount,
  hasResults,
  hasActiveSession,
  connectionStateLabel,
  onStopSession
}: {
  workflowPhase: ConsoleViewProps["workflowPhase"];
  workspaceView: ConsoleViewProps["workspaceView"];
  onSelectWorkspaceView(nextView: ConsoleViewProps["workspaceView"]): void;
  projectTitle: string;
  projectSubtitle: string;
  readiness: ProjectControlsProps["readiness"];
  recentProjectCount: number;
  readyPendingItemCount: number;
  hasResults: boolean;
  hasActiveSession: boolean;
  connectionStateLabel: string;
  onStopSession(): void;
}) {
  const navItems: Array<{
    view: ConsoleViewProps["workspaceView"];
    label: string;
    detail: string;
    disabled?: boolean;
    badge?: string | null;
  }> = [
    {
      view: "project",
      label: "Project",
      detail: "Choose or create a workspace",
      badge: recentProjectCount > 0 ? `${recentProjectCount}` : null
    },
    {
      view: "compose",
      label: "Compose",
      detail: hasActiveSession ? "Write the next prompt" : "Prepare the task",
      badge: readyPendingItemCount > 0 ? `${readyPendingItemCount}` : null
    },
    {
      view: "live-run",
      label: "Live run",
      detail: hasActiveSession ? "Watch Codex work" : "Available during a session",
      disabled: !hasActiveSession
    },
    {
      view: "results",
      label: "Results",
      detail: hasResults ? "Review output" : "Available after a run",
      disabled: !hasResults
    }
  ];

  const readinessLabel =
    readiness?.overallStatus === "failed"
      ? "Needs attention"
      : readiness?.overallStatus === "warning"
        ? "Review warnings"
        : "All systems ready";

  return (
    <section className="project-rail rail-card">
      <div className="project-rail-header">
        <p className="section-kicker">Workspace</p>
        <strong>{projectTitle}</strong>
        <span>{projectSubtitle}</span>
      </div>

      <nav className="project-nav" aria-label="Workspace views">
        {navItems.map((item) => {
          const isSelected = workspaceView === item.view;
          const isCurrentPhase = workflowPhase === item.view;

          return (
            <button
              key={item.view}
              type="button"
              aria-label={`${item.label} view`}
              className={`project-nav-item ${isSelected ? "selected" : ""} ${isCurrentPhase ? "current-phase" : ""}`.trim()}
              onClick={() => onSelectWorkspaceView(item.view)}
              disabled={item.disabled}
            >
              <span className="project-nav-copy">
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </span>
              {item.badge ? <span className="project-nav-badge">{item.badge}</span> : null}
            </button>
          );
        })}
      </nav>

      <div className="project-rail-status">
        <span className={`project-health project-health-${readiness?.overallStatus ?? "passed"}`}>{readinessLabel}</span>
        <span className="project-rail-connection">{connectionStateLabel}</span>
      </div>

      {hasActiveSession ? (
        <button type="button" className="destructive project-rail-stop" onClick={onStopSession}>
          Stop session
        </button>
      ) : null}
    </section>
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
  const [isCreateProjectExpanded, setIsCreateProjectExpanded] = useState(false);
  const readinessHasWarningsOrFailures = Boolean(
    readiness && readiness.items.some((item) => item.status === "warning" || item.status === "failed")
  );
  const readinessSummary = !repoPath.trim()
    ? "Choose a project to check readiness."
    : readiness
      ? readiness.overallStatus === "passed"
        ? "All systems ready"
        : readiness.overallStatus === "warning"
          ? "Warnings to review"
          : "Needs attention"
      : "Check environment readiness.";

  return (
    <section className="controls workspace-card project-workspace-card">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Project</p>
          <h2>Choose a project</h2>
        </div>
        <span className="section-chip">{status.active ? "Session active" : "Setup"}</span>
      </div>
      <p className="helper-text project-workspace-summary">
        Open one real project folder, then start Codex when the workspace looks ready.
      </p>
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
      {repoPickerMessage ? <p className="helper-text repo-picker-message">{repoPickerMessage}</p> : null}
      <p className="helper-text project-path-guidance">Use one real project folder. Manual path entry stays fully supported.</p>
      <div className="project-launch-actions">
        <button
          type="button"
          className="primary-action-button project-launch-button"
          onClick={onChooseRepo}
        >
          Open project
        </button>
        <button
          type="button"
          className="ghost project-launch-button"
          onClick={() => setIsCreateProjectExpanded(true)}
        >
          New project
        </button>
      </div>
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
      <CollapsibleSection
        title="Recent projects"
        subtitle={
          isLoadingRecentProjects
            ? "Loading recent projects..."
            : recentProjects.length === 0
              ? "No previous projects yet."
              : `${recentProjects.length} saved project${recentProjects.length === 1 ? "" : "s"} ready to reuse.`
        }
        className="collapsible-section-secondary"
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
      <CollapsibleSection
        title="Environment readiness"
        subtitle={readinessSummary}
        defaultExpanded={readinessHasWarningsOrFailures}
        className={readiness?.overallStatus === "passed" ? "collapsible-section-quiet readiness-collapsible" : "readiness-collapsible"}
      >
        <div className="readiness-card">
          <div className="readiness-card-header">
            <div>
              <strong>Session preflight</strong>
              <p className="helper-text collapsible-section-subtitle">
                {isLoadingSettings ? "Loading default project root..." : defaultRepoRoot || "Choose a folder"}
              </p>
            </div>
            <button type="button" className="ghost" onClick={onRefreshReadiness} disabled={!repoPath.trim() || isLoadingReadiness}>
              {isLoadingReadiness ? "Checking..." : "Refresh"}
            </button>
          </div>
          {!repoPath.trim() ? (
            <p className="helper-text">Choose a project folder to run readiness checks.</p>
          ) : isLoadingReadiness ? (
            <p className="helper-text">Checking Codex, Git, access, and sandbox readiness...</p>
          ) : readiness ? (
            <>
              <div className={`readiness-overall readiness-${readiness.overallStatus}`}>
                <strong>{formatReadinessStatusLabel(readiness.overallStatus)}</strong>
                <span>{readiness.canStart ? "Ready to start." : "Fix the failed items before starting."}</span>
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
          <p className="helper-text readiness-footnote">Server: {connectionStateLabel}</p>
        </div>
      </CollapsibleSection>
      <div className="project-secondary-sections">
        <p className="section-divider-label">New project</p>
        <CollapsibleSection
          title="Create new project"
          subtitle="Create a clean folder first, then start Codex inside it."
          className="collapsible-section-secondary"
          defaultExpanded={isCreateProjectExpanded}
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

function WorkflowStepper({ workflowPhase }: { workflowPhase: ConsoleViewProps["workflowPhase"] }) {
  const steps: Array<{ key: ConsoleViewProps["workflowPhase"]; label: string; detail: string }> = [
    { key: "project", label: "Project", detail: "Select workspace" },
    { key: "compose", label: "Compose", detail: "Write your prompt" },
    { key: "live-run", label: "Live Run", detail: "Codex is working" },
    { key: "results", label: "Results", detail: "Review output" }
  ];

  const activeIndex = steps.findIndex((step) => step.key === workflowPhase);

  return (
    <section className="workflow-stepper workspace-card" aria-label="Workflow progress">
      {steps.map((step, index) => {
        const isComplete = index < activeIndex;
        const isActive = index === activeIndex;

        return (
          <div key={step.key} className={`workflow-step ${isActive ? "active" : ""} ${isComplete ? "complete" : ""}`}>
            <span className="workflow-step-index">{index + 1}</span>
            <div className="workflow-step-copy">
              <strong>{step.label}</strong>
              <span>{step.detail}</span>
            </div>
            {index < steps.length - 1 ? <span className="workflow-step-arrow" aria-hidden="true">›</span> : null}
          </div>
        );
      })}
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
  onRemoveAttachment,
  compact = false
}: PendingContextPanelProps & { compact?: boolean }) {
  const groupedItems = groupPendingContextItems(pendingContextItems);

  return (
    <section className={`context-card utility-surface ${compact ? "utility-surface-compact" : ""}`.trim()}>
      <div className={`section-heading ${compact ? "utility-section-heading compact-mode" : ""}`.trim()}>
        {!compact ? (
          <div>
            <p className="section-kicker">Context</p>
            <h2>Ready context</h2>
          </div>
        ) : <span />}
        <button type="button" className="ghost" onClick={onClearAll} disabled={pendingContextItems.length === 0}>
          Clear all
        </button>
      </div>
      <p className="pending-context-subtitle">
        {readyPendingItemCount > 0
          ? `${readyPendingItemCount} context item${readyPendingItemCount === 1 ? "" : "s"} ready for the next prompt.`
          : pendingContextItems.length > 0
            ? "Context is still being prepared."
            : pendingContextEmptyState}
      </p>
      {pendingContextItems.length === 0 ? (
        <p className="empty-context">Add context only when this task needs it.</p>
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
          <strong>{compact ? "Included next" : "Pending context summary"}</strong>
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
  onSendPrompt
}: ComposerPanelProps) {
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
        </div>
        <div className="attachment-actions">
          <button type="button" className="secondary" onClick={() => fileInputRef.current?.click()} disabled={!status.active}>
            Attach files
          </button>
          <span className="helper-text">Drop files or paste an image.</span>
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
                <p>Add a prompt or context to preview the final message.</p>
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
        <span className="helper-text subtle-helper">Large pasted text becomes a saved context file.</span>
      </div>
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
  onCopyDiff,
  compact = false
}: RepoInsightsPanelProps & { compact?: boolean }) {
  const hasDiffState = diffViewer.isLoading || Boolean(diffViewer.error) || Boolean(diffViewer.diff) || Boolean(diffEmptyState);

  return (
    <section className={`git-section utility-surface ${compact ? "utility-surface-compact" : ""}`.trim()}>
      <div className={`section-heading utility-section-heading ${compact ? "compact-mode" : ""}`.trim()}>
        {!compact ? <div><h2>Changes</h2></div> : <span />}
      </div>
      {status.active ? (
        <div className="git-actions">
          <button type="button" className="ghost" onClick={onViewDiff}>
            Inspect changes
          </button>
        </div>
      ) : null}
      {!status.active ? <p className="git-empty">No changes yet. Start a session to inspect the project.</p> : null}
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
            {!isLoadingGitStatus && !hasDiffState && gitStatus?.isGitRepo ? (
              <p className="git-empty">No change review is open yet. Inspect changes when you want to review edits.</p>
            ) : null}
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
  formatDuration,
  compact = false
}: SessionHistoryPanelProps & { compact?: boolean }) {
  return (
    <section className={`history-section utility-surface ${compact ? "utility-surface-compact" : ""}`.trim()}>
      <div className={`section-heading utility-section-heading ${compact ? "compact-mode" : ""}`.trim()}>
        {!compact ? <div><h2>Session history</h2></div> : <span />}
        {!compact ? <span className="section-chip">{sessions.length}</span> : null}
      </div>
      <div className="history-list">
        {isLoadingSessions ? <p className="history-empty">Loading recent sessions...</p> : null}
        {!isLoadingSessions && sessions.length === 0 ? <p className="history-empty">No previous sessions yet.</p> : null}
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
          <p>Finish a session to review output.</p>
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
  onPrepareNextPrompt,
  formatDuration
}: {
  sessionBanner: ConsoleViewProps["sessionBanner"];
  sessionActivity: ConsoleViewProps["sessionActivity"];
  latestSession: ConsoleViewProps["latestSession"];
  repoInsightsPanel: ConsoleViewProps["repoInsightsPanel"];
  onOpenTranscript(): void;
  onOpenChanges(): void;
  onPrepareNextPrompt(): void;
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
  const primaryActionLabel =
    sessionBanner.state === "failed" || sessionBanner.state === "disconnected" ? "Review what happened" : "Review transcript";
  const secondaryActionLabel =
    sessionBanner.state === "failed" || sessionBanner.state === "disconnected" ? "Prepare next prompt" : "Write next prompt";

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
      <div className="results-summary-actions">
        <button type="button" onClick={onOpenTranscript} disabled={!transcriptAvailable}>
          {primaryActionLabel}
        </button>
        <button type="button" className="secondary" onClick={onPrepareNextPrompt}>
          {secondaryActionLabel}
        </button>
        <button type="button" className="ghost" onClick={onOpenChanges}>
          {changesAvailable ? "Review changes" : "Check changes"}
        </button>
      </div>
      <p className="helper-text results-next-step">{getSuggestedNextAction(sessionBanner)}</p>
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
      <div className="utility-panel-header">
        <div>
          <p className="section-kicker">Review</p>
          <h2>{formatUtilityModeLabel(utilityMode)}</h2>
        </div>
      </div>
      <div className="utility-mode-tabs" role="tablist" aria-label="Utility panels">
        {utilityTabButtons}
      </div>
      <div className="utility-panel-body">
        {utilityMode === "context" ? <PendingContextPanel {...pendingContextPanel} compact /> : null}
        {utilityMode === "changes" ? <RepoInsightsPanel {...repoInsightsPanel} compact /> : null}
        {utilityMode === "history" ? <SessionHistoryPanel {...sessionHistoryPanel} showTranscriptViewer={false} compact /> : null}
        {utilityMode === "transcript" ? <SessionHistoryPanel {...sessionHistoryPanel} showTranscriptViewer compact /> : null}
      </div>
    </section>
  );
}

function ApprovalActionStrip({
  sessionBanner
}: {
  sessionBanner: ConsoleViewProps["sessionBanner"];
}) {
  if (sessionBanner.state !== "awaiting-approval" && sessionBanner.state !== "awaiting-input") {
    return null;
  }

  const isApproval = sessionBanner.state === "awaiting-approval";

  return (
    <section className={`approval-action-strip ${isApproval ? "approval-pending" : "awaiting-input-strip"}`}>
      <div className="approval-action-copy">
        <strong>{isApproval ? "Codex is waiting for approval" : "Codex is waiting for your next instruction"}</strong>
        <p>
          {isApproval
            ? "Approve in the terminal to keep the task moving. After approval, work will continue automatically."
            : "Use the prompt box or the terminal to continue the session."}
        </p>
      </div>
      <button
        type="button"
        className={isApproval ? undefined : "secondary"}
        onClick={() => {
          const promptInput = document.getElementById("prompt-input");
          if (promptInput instanceof HTMLTextAreaElement) {
            promptInput.focus();
            promptInput.scrollIntoView({ block: "center", behavior: "smooth" });
          }
        }}
      >
        {isApproval ? "Review terminal" : "Write next prompt"}
      </button>
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
  workspaceView,
  utilityMode,
  onSelectWorkspaceView,
  onUtilityModeChange,
  status,
  sessionBanner,
  sessionActivity,
  latestSession,
  terminalContainerRef
}: ConsoleViewProps) {
  const projectTitle = formatProjectTitle(projectControls.repoPath, projectControls.defaultRepoRoot);
  const projectSubtitle = buildProjectSubtitle(projectControls.repoPath, projectControls.defaultRepoRoot);
  const terminalGuidance = buildTerminalGuidance(sessionBanner);
  const hasResults = workflowPhase === "results" || Boolean(latestSession);
  const showResultsSummary = workspaceView === "results";
  const showTerminalGuidance =
    sessionBanner.state === "awaiting-approval" ||
    sessionBanner.state === "awaiting-input" ||
    sessionBanner.state === "disconnected" ||
    sessionBanner.state === "failed";
  const showProjectWorkspace = workspaceView === "project";
  const showComposeWorkspace = workspaceView === "compose";
  const showLiveRunWorkspace = workspaceView === "live-run";

  return (
    <div className={`console-layout workflow-${workflowPhase} workspace-view-${workspaceView}`}>
      <aside className="control-rail">
        <ProjectRail
          workflowPhase={workflowPhase}
          workspaceView={workspaceView}
          onSelectWorkspaceView={onSelectWorkspaceView}
          projectTitle={projectTitle}
          projectSubtitle={projectSubtitle}
          readiness={projectControls.readiness}
          recentProjectCount={projectControls.recentProjects.length}
          readyPendingItemCount={pendingContextPanel.readyPendingItemCount}
          hasResults={hasResults}
          hasActiveSession={status.active}
          connectionStateLabel={projectControls.connectionStateLabel}
          onStopSession={projectControls.onStopSession}
        />
      </aside>

      <main className="workspace-main">
        <WorkflowStepper workflowPhase={workspaceView} />

        {showProjectWorkspace ? <ProjectControls {...projectControls} /> : null}

        {showComposeWorkspace ? <ComposerPanel {...composerPanel} /> : null}

        {showLiveRunWorkspace ? (
          <>
            <section className={`terminal-section workspace-card ${status.active ? "terminal-section-live" : ""}`.trim()}>
              <div
                className={`terminal-stage ${sessionBanner.state === "awaiting-approval" ? "terminal-stage-attention" : ""} ${
                  sessionBanner.state === "failed" || sessionBanner.state === "disconnected" ? "terminal-stage-muted" : ""
                }`}
                data-session-state={sessionBanner.state}
              >
                <div className="terminal-stage-header">
                  <div>
                    <p className="section-kicker">Live run</p>
                    <h2>Live Codex terminal</h2>
                    <p className="terminal-subcopy">
                      {status.active
                        ? sessionBanner.state === "awaiting-approval"
                          ? "Codex paused for approval."
                          : "Codex is running your task."
                        : "Start a session to open the terminal workspace."}
                    </p>
                  </div>
                  <div className="terminal-stage-meta">
                    {sessionBanner.state === "awaiting-approval" || sessionBanner.state === "awaiting-input" ? (
                      <span className="section-chip">{formatSessionBannerStateLabel(sessionBanner.state)}</span>
                    ) : null}
                    <div className="terminal-toolbar">
                      <button
                        type="button"
                        className="ghost terminal-tool-button"
                        onClick={() => {
                          const terminal = terminalContainerRef.current;
                          terminal?.scrollIntoView({ block: "center", behavior: "smooth" });
                        }}
                      >
                        Focus
                      </button>
                    </div>
                  </div>
                </div>
                {showTerminalGuidance && terminalGuidance ? <p className="terminal-guidance">{terminalGuidance}</p> : null}
                <div ref={terminalContainerRef} className="terminal-panel" />
              </div>
            </section>
            <ApprovalActionStrip sessionBanner={sessionBanner} />
            <section className="workspace-followup">
              <ComposerPanel {...composerPanel} />
            </section>
          </>
        ) : null}

        {showResultsSummary ? (
          <ResultsSummaryCard
            sessionBanner={sessionBanner}
            sessionActivity={sessionActivity}
            latestSession={latestSession}
            repoInsightsPanel={repoInsightsPanel}
            onOpenTranscript={() => onUtilityModeChange("transcript")}
            onOpenChanges={() => onUtilityModeChange("changes")}
            onPrepareNextPrompt={() => {
              onSelectWorkspaceView("compose");
              const promptInput = document.getElementById("prompt-input");
              if (promptInput instanceof HTMLTextAreaElement) {
                promptInput.focus();
                promptInput.scrollIntoView({ block: "center", behavior: "smooth" });
              }
            }}
            formatDuration={sessionHistoryPanel.formatDuration}
          />
        ) : null}
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
