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

function buildTerminalGuidance(sessionBanner: SessionBanner): string | null {
  if (sessionBanner.state === "awaiting-approval") {
    return "Codex is paused for approval. Read the request in the terminal, approve it there with Enter or cancel with Esc, and Codex will continue automatically afterward.";
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

export function ConsoleHeader({ activeView, onChangeView, sessionBanner }: ConsoleHeaderProps) {
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
  onStartSession,
  onStopSession,
  connectionStateLabel,
  defaultRepoRoot,
  isLoadingSettings,
  recentProjects,
  isLoadingRecentProjects
}: ProjectControlsProps) {
  return (
    <section className="controls rail-card">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Workspace</p>
          <h2>Project</h2>
        </div>
        <span className="section-chip">{status.active ? "Active" : "Ready"}</span>
      </div>
      <label htmlFor="repo-path">Repo path</label>
      <div className="repo-input-row">
        <input
          id="repo-path"
          type="text"
          value={repoPath}
          onChange={(event) => onRepoPathChange(event.target.value)}
          placeholder={defaultRepoRoot || "/home/you/project"}
        />
        <button type="button" className="secondary" onClick={onChooseRepo}>
          Choose repo
        </button>
      </div>
      <p className="helper-text">
        Enter one real project folder here, not a parent directory that contains many different projects.
      </p>
      {repoPickerMessage ? <p className="helper-text repo-picker-message">{repoPickerMessage}</p> : null}
      <div className="control-actions">
        <button type="button" onClick={onStartSession} disabled={status.active || !repoPath.trim()}>
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
      <div className="recent-projects">
        <div className="recent-projects-header">
          <strong>Recent projects</strong>
          <span className="section-chip">{recentProjects.length}</span>
        </div>
        {isLoadingRecentProjects ? <p className="helper-text">Loading recent projects...</p> : null}
        {!isLoadingRecentProjects && recentProjects.length === 0 ? (
          <p className="helper-text">Open a project once and it will appear here for quick reuse.</p>
        ) : null}
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
    <section className="rail-card context-card">
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
          <p className="helper-text">
            Write the task, attach supporting context, and review the final assembled prompt before sending it.
          </p>
          {terminalGuidance ? <p className="helper-text composer-guidance">{terminalGuidance}</p> : null}
        </div>
        <div className="attachment-actions">
          <button type="button" className="secondary" onClick={() => fileInputRef.current?.click()} disabled={!status.active}>
            Attach files
          </button>
          <span className="helper-text">Drop files here, use the picker, or paste an image directly into the prompt box.</span>
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
            <p className="helper-text">This is the exact generated prompt that will be sent, including saved context references.</p>
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
          Pasted text under 10,000 characters stays inline. Larger pastes become local files automatically.
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
  return (
    <section className="git-section rail-card">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Repository</p>
          <h2>Repo insights</h2>
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
      {!status.active ? <p className="git-empty">Start a session to see repo status.</p> : null}
      {status.active && isLoadingGitStatus ? <p className="git-empty">Loading repo status...</p> : null}
      {status.active && gitStatus ? (
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
      {status.active && (diffViewer.isLoading || diffViewer.error || diffViewer.diff) ? (
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
    </section>
  );
}

export function SessionHistoryPanel({
  sessions,
  isLoadingSessions,
  transcriptViewer,
  onViewTranscript,
  onCopyTranscript,
  formatDuration
}: SessionHistoryPanelProps) {
  return (
    <section className="history-section rail-card">
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
      {transcriptViewer.session ? (
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
            <div className="transcript-actions">
              <button
                type="button"
                className="ghost"
                onClick={onCopyTranscript}
                disabled={!transcriptViewer.transcript}
              >
                Copy transcript
              </button>
            </div>
          </div>
          <p className="transcript-helper-text">
            Cleaned transcript output preserves the readable session flow while removing terminal control noise.
          </p>
          {transcriptViewer.isLoading ? <p className="history-empty">Loading transcript...</p> : null}
          {!transcriptViewer.isLoading && transcriptViewer.error ? <p className="history-empty">{transcriptViewer.error}</p> : null}
          {!transcriptViewer.isLoading && !transcriptViewer.error ? (
            <pre className="transcript-panel">{transcriptViewer.transcript || "Transcript is empty."}</pre>
          ) : null}
        </div>
      ) : (
        <div className="transcript-empty-state">
          <strong>Transcript viewer</strong>
          <p>Open any recent session to read its transcript here.</p>
        </div>
      )}
    </section>
  );
}

export function ConsoleView({
  projectControls,
  pendingContextPanel,
  composerPanel,
  repoInsightsPanel,
  sessionHistoryPanel,
  status,
  sessionBanner,
  terminalContainerRef
}: ConsoleViewProps) {
  const terminalGuidance = buildTerminalGuidance(sessionBanner);

  return (
    <div className="console-layout">
      <aside className="control-rail">
        <ProjectControls {...projectControls} />
        <PendingContextPanel {...pendingContextPanel} />
      </aside>

      <main className="workspace-main">
        <ComposerPanel {...composerPanel} />

        <section className="terminal-section workspace-card">
          <div className="terminal-stage-header">
            <div>
              <p className="section-kicker">Console</p>
              <h2>Live Codex terminal</h2>
            </div>
          <div className="terminal-stage-meta">
              <span className="section-chip">{status.active ? formatSessionBannerStateLabel(sessionBanner.state) : "Waiting"}</span>
          </div>
        </div>
          {terminalGuidance ? <p className="terminal-guidance">{terminalGuidance}</p> : null}
          <div ref={terminalContainerRef} className="terminal-panel" />
        </section>
      </main>

      <aside className="insights-rail">
        <RepoInsightsPanel {...repoInsightsPanel} />
        <SessionHistoryPanel {...sessionHistoryPanel} />
      </aside>
    </div>
  );
}
