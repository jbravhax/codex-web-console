import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import {
  createPastedImageFileName,
  formatAttachmentSize,
  isSupportedAttachmentName
} from "./attachments";
import type { PendingAttachment } from "./attachment-types";
import {
  buildGitDiffEmptyState,
  buildGitDiffPanelText,
  copyGitDiffText,
  loadGitDiff,
  type GitDiffSummary
} from "./git-diff-viewer";
import {
  buildDocumentReference,
  classifyPaste,
  type SavedPromptDocument
} from "./prompt-documents";
import {
  appendGeneratedDocumentItem,
  appendPendingContextItem,
  buildPromptPreviewOutput,
  buildPromptPreviewSections,
  buildPendingContextPreview,
  buildPromptWithPendingContext,
  clearPendingContext,
  copyGeneratedPromptContext,
  countReadyPendingContextItems,
  copyRelativePath,
  createPendingContextItemFromAttachment,
  createUploadingContextItem,
  removePendingContextById,
  replaceUploadingItem,
  updateUploadingProgress,
  type PendingContextItem
} from "./pending-context";
import { createInitialSessionBanner, reduceSessionBanner, type SessionBanner } from "./session-banner";
import { buildSessionWebSocketUrl } from "./session-connection";
import { copyTranscriptText, loadSessionTranscript } from "./session-transcripts";
import { friendlyUploadErrorMessage } from "./ui-messages";

type ThemeSetting = "light" | "dark";

type SessionStatus = {
  active: boolean;
  repoPath: string | null;
};

type SessionHistoryItem = {
  id: string;
  repoPath: string;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
};

type TranscriptViewerState = {
  session: SessionHistoryItem | null;
  transcript: string;
  isLoading: boolean;
  error: string;
};

type DiffViewerState = {
  diff: GitDiffSummary | null;
  isLoading: boolean;
  error: string;
};

type RecentProjectItem = {
  repoPath: string;
  lastOpenedAt: string;
  openCount: number;
  available: boolean;
};

type AppSettings = {
  codexExecutablePath: string;
  defaultRepoRoot: string;
  serverBindHost: string;
  serverPort: number;
  theme: ThemeSetting;
};

type GitStatusSummary = {
  repoPath: string;
  isGitRepo: boolean;
  branch: string | null;
  changedFilesCount: number;
  stagedFilesCount: number;
  untrackedFilesCount: number;
  message?: string;
};

type ServerMessage =
  | { type: "status"; payload: SessionStatus }
  | { type: "output"; payload: string }
  | { type: "exit"; payload: { exitCode: number; signal: number } }
  | { type: "error"; payload: string };

const DEFAULT_SETTINGS: AppSettings = {
  codexExecutablePath: "codex",
  defaultRepoRoot: "",
  serverBindHost: "127.0.0.1",
  serverPort: 8787,
  theme: "dark"
};

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) {
    return "In progress";
  }

  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

export function App() {
  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const statusRef = useRef<SessionStatus>({ active: false, repoPath: null });
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [activeView, setActiveView] = useState<"console" | "settings">("console");
  const [repoPath, setRepoPath] = useState("");
  const [promptText, setPromptText] = useState("");
  const [status, setStatus] = useState<SessionStatus>({ active: false, repoPath: null });
  const [sessions, setSessions] = useState<SessionHistoryItem[]>([]);
  const [recentProjects, setRecentProjects] = useState<RecentProjectItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [gitStatus, setGitStatus] = useState<GitStatusSummary | null>(null);
  const [pendingContextItems, setPendingContextItems] = useState<PendingContextItem[]>([]);
  const [error, setError] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [contextMessage, setContextMessage] = useState("");
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isLoadingRecentProjects, setIsLoadingRecentProjects] = useState(true);
  const [isLoadingGitStatus, setIsLoadingGitStatus] = useState(false);
  const [diffViewer, setDiffViewer] = useState<DiffViewerState>({
    diff: null,
    isLoading: false,
    error: ""
  });
  const [transcriptViewer, setTranscriptViewer] = useState<TranscriptViewerState>({
    session: null,
    transcript: "",
    isLoading: false,
    error: ""
  });
  const [sessionBanner, setSessionBanner] = useState<SessionBanner>(createInitialSessionBanner);
  const [isPromptPreviewExpanded, setIsPromptPreviewExpanded] = useState(false);
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "disconnected">(
    "connecting"
  );

  const readyPendingItemCount = countReadyPendingContextItems(pendingContextItems);
  const pendingContextPreviewLines = buildPendingContextPreview(pendingContextItems);
  const promptPreviewSections = buildPromptPreviewSections(promptText, pendingContextItems);
  const generatedPromptPreview = buildPromptPreviewOutput(promptText, pendingContextItems);
  const diffPanelText = diffViewer.diff ? buildGitDiffPanelText(diffViewer.diff) : "";
  const diffEmptyState = diffViewer.diff ? buildGitDiffEmptyState(diffViewer.diff) : "";

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"IBM Plex Mono", monospace',
      theme: {
        background: "#111827",
        foreground: "#e5e7eb"
      }
    });
    const fitAddon = new FitAddon();

    terminal.loadAddon(fitAddon);
    terminal.open(terminalContainerRef.current!);
    fitAddon.fit();
    terminal.writeln("Codex CLI Web Console");
    terminal.writeln("Enter a repo path and start a session.");
    terminal.writeln("");

    terminal.onData((data) => {
      if (statusRef.current.active) {
        socketRef.current?.send(JSON.stringify({ type: "input", data }));
      }
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const handleResize = () => {
      fitAddon.fit();
      const dimensions = fitAddon.proposeDimensions();
      if (dimensions && statusRef.current.active) {
        socketRef.current?.send(JSON.stringify({ type: "resize", cols: dimensions.cols, rows: dimensions.rows }));
      }
    };

    resizeObserverRef.current = new ResizeObserver(handleResize);
    resizeObserverRef.current.observe(terminalContainerRef.current!);
    window.addEventListener("resize", handleResize);
    terminal.onResize(({ cols, rows }) => {
      if (statusRef.current.active) {
        socketRef.current?.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    return () => {
      resizeObserverRef.current?.disconnect();
      window.removeEventListener("resize", handleResize);
      terminal.dispose();
    };
  }, []);

  useEffect(() => {
    void fetch("/api/settings")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not load settings.");
        }

        const payload = (await response.json()) as AppSettings;
        setSettings(payload);
        setSettingsDraft(payload);
        setRepoPath((current) => current || payload.defaultRepoRoot);
      })
      .catch((requestError: unknown) => {
        const message = requestError instanceof Error ? requestError.message : "Could not load settings.";
        setError(friendlyUploadErrorMessage(message));
      })
      .finally(() => {
        setIsLoadingSettings(false);
      });
  }, []);

  useEffect(() => {
    setIsLoadingRecentProjects(true);
    void fetch("/api/recent-projects")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not load recent projects.");
        }

        const payload = (await response.json()) as { items: RecentProjectItem[] };
        setRecentProjects(payload.items);
      })
      .catch((requestError: unknown) => {
        const message = requestError instanceof Error ? requestError.message : "Could not load recent projects.";
        setError(message);
      })
      .finally(() => {
        setIsLoadingRecentProjects(false);
      });
  }, [status.active]);

  useEffect(() => {
    setIsLoadingSessions(true);
    void fetch("/api/sessions")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not load recent sessions.");
        }

        const payload = (await response.json()) as { items: SessionHistoryItem[] };
        setSessions(payload.items);
      })
      .catch((requestError: unknown) => {
        const message = requestError instanceof Error ? requestError.message : "Could not load recent sessions.";
        setError(message);
      })
      .finally(() => {
        setIsLoadingSessions(false);
      });
  }, [status.active]);

  useEffect(() => {
    if (!status.active || !status.repoPath) {
      setGitStatus(null);
      return;
    }

    let cancelled = false;
    setIsLoadingGitStatus(true);

    const loadGitStatus = async () => {
      try {
        const response = await fetch(`/api/git/status?repoPath=${encodeURIComponent(status.repoPath ?? "")}`);
        const payload = (await response.json()) as GitStatusSummary | { error: string };
        if (!response.ok || ("error" in payload && typeof payload.error === "string")) {
          throw new Error("error" in payload ? payload.error : "Could not load Git status.");
        }

        if (!cancelled) {
          setGitStatus(payload as GitStatusSummary);
          setIsLoadingGitStatus(false);
        }
      } catch (requestError) {
        if (!cancelled) {
          setGitStatus(null);
          setError(requestError instanceof Error ? requestError.message : "Could not load Git status.");
          setIsLoadingGitStatus(false);
        }
      }
    };

    void loadGitStatus();
    const intervalId = window.setInterval(() => {
      void loadGitStatus();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [status.active, status.repoPath]);

  useEffect(() => {
    const socket = new WebSocket(buildSessionWebSocketUrl(window.location));
    setSessionBanner((current) => reduceSessionBanner(current, { type: "websocket-connecting" }));

    socket.onopen = () => {
      setConnectionState("connected");
      setError("");
      setSessionBanner((current) => reduceSessionBanner(current, { type: "websocket-open" }));
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;

      if (message.type === "status") {
        setStatus(message.payload);
        setSessionBanner((current) =>
          reduceSessionBanner(current, {
            type: "status-received",
            active: message.payload.active,
            repoPath: message.payload.repoPath
          })
        );
        if (message.payload.repoPath) {
          setRepoPath(message.payload.repoPath);
        }
        if (message.payload.active) {
          setError("");
        }
        return;
      }

      if (message.type === "output") {
        terminalRef.current?.write(message.payload);
        return;
      }

      if (message.type === "exit") {
        setStatus((current) => ({ active: false, repoPath: current.repoPath }));
        setSessionBanner((current) =>
          reduceSessionBanner(current, {
            type: "exit-received",
            exitCode: message.payload.exitCode,
            signal: message.payload.signal
          })
        );
        setPendingContextItems([]);
        terminalRef.current?.writeln("");
        terminalRef.current?.writeln(
          `[session ended: exit ${message.payload.exitCode}, signal ${message.payload.signal}]`
        );
        return;
      }

      if (message.type === "error") {
        const detail = friendlyUploadErrorMessage(message.payload);
        setError(detail);
        setSessionBanner((current) => reduceSessionBanner(current, { type: "error-received", detail }));
        terminalRef.current?.writeln("");
        terminalRef.current?.writeln(`[error] ${message.payload}`);
      }
    };

    socket.onclose = () => {
      setConnectionState("disconnected");
      setStatus((current) => ({ active: false, repoPath: current.repoPath }));
      const detail = "Connection to the local Codex server was closed. Restart the server if needed.";
      setSessionBanner((current) => reduceSessionBanner(current, { type: "websocket-close", detail }));
      setError(detail);
    };

    socketRef.current = socket;

    return () => {
      socket.close();
    };
  }, []);

  const startSession = () => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      const detail = "The local server connection is not ready yet.";
      setError(detail);
      setSessionBanner((current) => reduceSessionBanner(current, { type: "error-received", detail }));
      return;
    }

    setError("");
    setContextMessage("");
    setSessionBanner((current) => reduceSessionBanner(current, { type: "start-requested", repoPath }));
    terminalRef.current?.clear();
    socketRef.current?.send(
      JSON.stringify({
        type: "start",
        repoPath
      })
    );

    const dimensions = fitAddonRef.current?.proposeDimensions();
    if (dimensions) {
      socketRef.current?.send(
        JSON.stringify({
          type: "resize",
          cols: dimensions.cols,
          rows: dimensions.rows
        })
      );
    }
  };

  const stopSession = () => {
    setError("");
    setContextMessage("");
    setSessionBanner((current) => reduceSessionBanner(current, { type: "stop-requested" }));
    socketRef.current?.send(JSON.stringify({ type: "stop" }));
  };

  const saveSettings = async () => {
    setError("");
    setSettingsMessage("");

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...settingsDraft,
          serverPort: Number(settingsDraft.serverPort)
        })
      });

      const payload = (await response.json()) as { settings?: AppSettings; message?: string; error?: string };
      if (!response.ok || !payload.settings) {
        throw new Error(payload.error || "Could not save settings.");
      }

      const nextSettings = payload.settings;
      setSettings(nextSettings);
      setSettingsDraft(nextSettings);
      setRepoPath((current) => current || nextSettings.defaultRepoRoot);
      setSettingsMessage(payload.message || "Settings saved.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save settings.");
    }
  };

  const saveLargePaste = async (content: string) => {
    if (!status.active || !status.repoPath) {
      setError("Start a Codex session before saving large pasted context.");
      return;
    }

    const response = await fetch("/api/documents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        repoPath: status.repoPath,
        content
      })
    });

    const payload = (await response.json()) as
      | SavedPromptDocument
      | {
          error: string;
        };

    if (!response.ok || ("error" in payload && typeof payload.error === "string")) {
      throw new Error("error" in payload ? payload.error : "Could not save pasted document.");
    }

    const document = payload as SavedPromptDocument;
    setPendingContextItems((current) => appendGeneratedDocumentItem(current, document));
    setPromptText((current) => {
      const separator = current.trim().length > 0 ? "\n" : "";
      return `${current}${separator}${buildDocumentReference(document.relativePath)}`;
    });
    setContextMessage(`Saved large pasted context to ${document.relativePath}.`);
  };

  const uploadAttachment = async (file: File, overrideFileName?: string) => {
    if (!status.active || !status.repoPath) {
      throw new Error("Start a Codex session before attaching files.");
    }

    if (!overrideFileName && !isSupportedAttachmentName(file.name)) {
      throw new Error("That file type is not supported for attachments.");
    }

    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const kind =
      (overrideFileName ?? file.name).toLowerCase().endsWith(".zip")
        ? "zip"
        : file.type.startsWith("image/")
          ? "image"
          : "file";

    setPendingContextItems((current) =>
      appendPendingContextItem(current, createUploadingContextItem(uploadId, overrideFileName ?? file.name, kind))
    );

    try {
      const activeRepoPath = status.repoPath;
      const attachment = await new Promise<PendingAttachment>((resolve, reject) => {
        const formData = new FormData();
        formData.append("repoPath", activeRepoPath);
        formData.append("file", file, overrideFileName ?? file.name);
        if (overrideFileName) {
          formData.append("overrideFileName", overrideFileName);
        }

        const request = new XMLHttpRequest();
        request.open("POST", "/api/attachments");
        request.responseType = "json";

        request.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const progressPercent = Math.round((event.loaded / event.total) * 100);
            setPendingContextItems((current) => updateUploadingProgress(current, uploadId, progressPercent));
          }
        };

        request.onerror = () => {
          reject(new Error("Could not upload attachment. Check the local server connection and try again."));
        };

        request.onload = () => {
          const payload = request.response as PendingAttachment | { error?: string } | null;
          if (request.status < 200 || request.status >= 300 || !payload || ("error" in payload && payload.error)) {
            reject(new Error(payload && "error" in payload && payload.error ? payload.error : "Could not upload attachment."));
            return;
          }

          resolve(payload as PendingAttachment);
        };

        request.send(formData);
      });

      setPendingContextItems((current) =>
        replaceUploadingItem(current, uploadId, createPendingContextItemFromAttachment(attachment))
      );
      setContextMessage(`Attached ${attachment.relativePath}.`);
    } catch (requestError) {
      setPendingContextItems((current) => removePendingContextById(current, uploadId));
      throw requestError;
    }
  };

  const handlePromptPaste = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"));
    if (imageItem) {
      event.preventDefault();

      const blob = imageItem.getAsFile();
      if (!blob) {
        setError("Could not read the pasted image.");
        return;
      }

      const pastedImageFile = new File([blob], createPastedImageFileName(), { type: "image/png" });
      setError("");
      setContextMessage("");

      try {
        await uploadAttachment(pastedImageFile, pastedImageFile.name);
      } catch (requestError) {
        setError(
          friendlyUploadErrorMessage(
            requestError instanceof Error ? requestError.message : "Could not save pasted image."
          )
        );
      }
      return;
    }

    const pastedText = event.clipboardData.getData("text");
    const pasteHandling = classifyPaste(pastedText);

    if (pasteHandling.kind === "small") {
      return;
    }

    event.preventDefault();

    if (pasteHandling.kind === "too-large") {
      setError(pasteHandling.message);
      return;
    }

    setError("");
    setContextMessage("");

    try {
      await saveLargePaste(pastedText);
    } catch (requestError) {
      setError(
        friendlyUploadErrorMessage(
          requestError instanceof Error ? requestError.message : "Could not save pasted document."
        )
      );
    }
  };

  const handleFileSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) {
      return;
    }

    setError("");
    setContextMessage("");

    try {
      for (const file of selectedFiles) {
        await uploadAttachment(file);
      }
    } catch (requestError) {
      setError(
        friendlyUploadErrorMessage(requestError instanceof Error ? requestError.message : "Could not upload attachment.")
      );
    } finally {
      event.target.value = "";
    }
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const droppedFiles = Array.from(event.dataTransfer.files ?? []);
    if (droppedFiles.length === 0) {
      return;
    }

    setError("");
    setContextMessage("");

    try {
      for (const file of droppedFiles) {
        await uploadAttachment(file);
      }
    } catch (requestError) {
      setError(
        friendlyUploadErrorMessage(
          requestError instanceof Error ? requestError.message : "Could not upload dropped files."
        )
      );
    }
  };

  const removeAttachment = (attachmentId: string) => {
    setPendingContextItems((current) => removePendingContextById(current, attachmentId));
  };

  const clearAllPendingContext = () => {
    setPendingContextItems(clearPendingContext());
    setContextMessage("Cleared all pending context references.");
  };

  const copyItemRelativePath = async (relativePath: string) => {
    try {
      await copyRelativePath(relativePath);
      setContextMessage(`Copied ${relativePath}.`);
      setError("");
    } catch {
      setError("Could not copy the relative path. Your browser may have blocked clipboard access.");
    }
  };

  const sendPrompt = () => {
    if (!status.active) {
      setError("Start a session before sending a prompt.");
      return;
    }

    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setError("The local server connection is not ready yet.");
      return;
    }

    const composedPrompt = buildPromptWithPendingContext(promptText, pendingContextItems);
    if (!composedPrompt.trim()) {
      setError("Enter a prompt before sending it to Codex.");
      return;
    }

    setError("");
    setContextMessage("");
    socketRef.current?.send(JSON.stringify({ type: "input", data: `${composedPrompt}\r` }));
    terminalRef.current?.writeln(`\n[web prompt sent]\n${composedPrompt}\n`);
    setPromptText("");
    setPendingContextItems([]);
    promptInputRef.current?.focus();
  };

  const copyPromptPreview = async () => {
    try {
      await copyGeneratedPromptContext(generatedPromptPreview);
      setContextMessage("Copied the generated prompt context.");
      setError("");
    } catch {
      setError("Could not copy the generated prompt context. Your browser may have blocked clipboard access.");
    }
  };

  const viewTranscript = async (session: SessionHistoryItem) => {
    setTranscriptViewer({
      session,
      transcript: "",
      isLoading: true,
      error: ""
    });

    try {
      const transcript = await loadSessionTranscript(session.id);
      setTranscriptViewer({
        session,
        transcript,
        isLoading: false,
        error: ""
      });
    } catch (requestError) {
      setTranscriptViewer({
        session,
        transcript: "",
        isLoading: false,
        error: requestError instanceof Error ? requestError.message : "Could not load transcript."
      });
    }
  };

  const copyLoadedTranscript = async () => {
    if (!transcriptViewer.transcript) {
      return;
    }

    try {
      await copyTranscriptText(transcriptViewer.transcript);
      setContextMessage("Copied transcript.");
      setError("");
    } catch {
      setError("Could not copy the transcript. Your browser may have blocked clipboard access.");
    }
  };

  const viewDiff = async () => {
    if (!status.repoPath) {
      return;
    }

    setDiffViewer({
      diff: null,
      isLoading: true,
      error: ""
    });

    try {
      const diff = await loadGitDiff(status.repoPath);
      setDiffViewer({
        diff,
        isLoading: false,
        error: ""
      });
    } catch (requestError) {
      setDiffViewer({
        diff: null,
        isLoading: false,
        error: requestError instanceof Error ? requestError.message : "Could not load Git diff."
      });
    }
  };

  const copyLoadedDiff = async () => {
    if (!diffPanelText) {
      return;
    }

    try {
      await copyGitDiffText(diffPanelText);
      setContextMessage("Copied diff.");
      setError("");
    } catch {
      setError("Could not copy the diff. Your browser may have blocked clipboard access.");
    }
  };

  const pendingContextEmptyState = !status.active
    ? "Start a session, then paste text, drop files, or upload context for Codex."
    : "Paste text, drop files, or upload context for Codex.";

  return (
    <div className="app-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Local only</p>
          <h1>Codex CLI Web Console</h1>
        </div>
        <div className="header-actions">
          <div className={`status-chip ${status.active ? "active" : ""}`}>
            {status.active ? "Session running" : "No active session"}
          </div>
          <div className="tab-row">
            <button
              type="button"
              className={activeView === "console" ? "tab-button active" : "tab-button secondary"}
              onClick={() => setActiveView("console")}
            >
              Console
            </button>
            <button
              type="button"
              className={activeView === "settings" ? "tab-button active" : "tab-button secondary"}
              onClick={() => setActiveView("settings")}
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
        <span className="session-banner-state">{sessionBanner.state}</span>
      </section>

      {activeView === "console" ? (
        <>
          <section className="controls">
            <label htmlFor="repo-path">Repo path</label>
            <div className="control-row">
              <input
                id="repo-path"
                type="text"
                value={repoPath}
                onChange={(event) => setRepoPath(event.target.value)}
                placeholder={settings.defaultRepoRoot || "/home/you/project"}
              />
              <button type="button" onClick={startSession} disabled={status.active || !repoPath.trim()}>
                Start session
              </button>
              <button type="button" onClick={stopSession} disabled={!status.active} className="secondary">
                Stop session
              </button>
            </div>
            <div className="recent-projects">
              <div className="recent-projects-header">
                <strong>Recent projects</strong>
                <span>{recentProjects.length}</span>
              </div>
              {isLoadingRecentProjects ? <p className="helper-text">Loading recent projects...</p> : null}
              {!isLoadingRecentProjects && recentProjects.length === 0 ? (
                <p className="helper-text">No recent projects yet.</p>
              ) : null}
              {recentProjects.length > 0 ? (
                <div className="recent-project-list">
                  {recentProjects.map((project) => (
                    <button
                      key={project.repoPath}
                      type="button"
                      className={`recent-project-chip ${project.available ? "" : "unavailable"}`}
                      onClick={() => setRepoPath(project.repoPath)}
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
            <p className="helper-text">
              Connection: {connectionState}. Default repo root:{" "}
              {isLoadingSettings ? "loading..." : settings.defaultRepoRoot || "not loaded"}.
            </p>
          </section>

          <div className="workspace-grid">
            <section className="terminal-section">
              <div ref={terminalContainerRef} className="terminal-panel" />
              <div className="prompt-panel">
                <label htmlFor="prompt-input">Prompt</label>
                <div
                  className="attachment-dropzone"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    void handleDrop(event);
                  }}
                >
                  <div className="attachment-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!status.active}
                    >
                      Attach files
                    </button>
                    <span className="helper-text">
                      Drag files here or paste an image into the prompt box.
                    </span>
                  </div>
                  <div className="pending-context-header">
                    <div>
                      <strong>Pending context</strong>
                      <p className="pending-context-subtitle">
                        {readyPendingItemCount > 0
                          ? `The next prompt will include ${readyPendingItemCount} ready context item${readyPendingItemCount === 1 ? "" : "s"}.`
                          : pendingContextItems.length > 0
                            ? "Context is still uploading."
                            : "Nothing extra will be added to the next prompt yet."}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      onClick={clearAllPendingContext}
                      disabled={pendingContextItems.length === 0}
                    >
                      Clear all pending context
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    className="hidden-input"
                    type="file"
                    multiple
                    accept=".txt,.md,.json,.csv,.log,.xml,.yaml,.yml,.png,.jpg,.jpeg,.webp,.pdf,.zip"
                    onChange={(event) => {
                      void handleFileSelection(event);
                    }}
                    disabled={!status.active}
                  />
                  {pendingContextItems.length === 0 ? (
                    <p className="empty-context">{pendingContextEmptyState}</p>
                  ) : (
                    <>
                      <div className="attachment-list">
                        {pendingContextItems.map((item) => (
                          <article
                            className={`attachment-chip ${item.warningText ? "warning" : ""} ${
                              item.uploadState === "uploading" ? "uploading" : ""
                            }`}
                            key={item.id}
                          >
                            <div className="attachment-main">
                              <div className="attachment-title-row">
                                <strong>
                                  {item.icon} {item.name}
                                </strong>
                                <div className="attachment-badges">
                                  <span className="attachment-badge">{item.typeLabel}</span>
                                  <span className="attachment-badge subtle">
                                    {item.kind === "generated-document"
                                      ? `${item.sizeBytes.toLocaleString()} characters`
                                      : formatAttachmentSize(item.sizeBytes)}
                                  </span>
                                  <span
                                    className={`attachment-badge ${
                                      item.uploadState === "ready" ? "ready" : "uploading"
                                    }`}
                                  >
                                    {item.uploadState === "ready" ? "Ready" : "Uploading"}
                                  </span>
                                  {item.warningText ? <span className="attachment-badge warning">Warning</span> : null}
                                </div>
                              </div>
                              <span className="attachment-path">{item.relativePath || item.detailLine}</span>
                              {item.relativePath ? <span>{item.detailLine}</span> : null}
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
                                className="secondary"
                                onClick={() => {
                                  void copyItemRelativePath(item.relativePath);
                                }}
                                disabled={!item.relativePath || item.uploadState !== "ready"}
                              >
                                Copy relative path
                              </button>
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => removeAttachment(item.id)}
                              >
                                Remove
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                      {pendingContextPreviewLines.length > 0 ? (
                        <div className="context-preview">
                          <strong>Next prompt preview</strong>
                          <p className="helper-text">
                            Codex will be asked to inspect these saved files and folders before reading your typed prompt.
                          </p>
                          <ul className="context-preview-list">
                            {pendingContextPreviewLines.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
                <textarea
                  id="prompt-input"
                  ref={promptInputRef}
                  value={promptText}
                  onChange={(event) => setPromptText(event.target.value)}
                  onPaste={(event) => {
                    void handlePromptPaste(event);
                  }}
                  placeholder="Type a prompt for Codex here. Large pasted text will be saved as a local markdown document."
                  disabled={!status.active}
                />
                <div className="prompt-preview-panel">
                  <div className="prompt-preview-header">
                    <div>
                      <strong>What Codex Will Receive</strong>
                      <p className="helper-text">
                        Review the exact generated prompt context before sending it.
                      </p>
                    </div>
                    <div className="prompt-preview-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setIsPromptPreviewExpanded((current) => !current)}
                      >
                        {isPromptPreviewExpanded ? "Hide preview" : "Show preview"}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          void copyPromptPreview();
                        }}
                        disabled={!generatedPromptPreview.trim()}
                      >
                        Copy generated context
                      </button>
                    </div>
                  </div>
                  {isPromptPreviewExpanded ? (
                    <div className="prompt-preview-body">
                      <div className="prompt-preview-sections">
                        {promptPreviewSections.map((section) => (
                          <article className="prompt-preview-section" key={section.label}>
                            <strong>{section.label}</strong>
                            <pre>{section.lines.join("\n")}</pre>
                          </article>
                        ))}
                      </div>
                      <article className="prompt-preview-section prompt-preview-full">
                        <strong>Full generated prompt</strong>
                        <pre>{generatedPromptPreview || "Nothing will be sent yet."}</pre>
                      </article>
                    </div>
                  ) : null}
                </div>
                <div className="prompt-actions">
                  <button type="button" onClick={sendPrompt} disabled={!status.active}>
                    Send prompt
                  </button>
                  <span className="helper-text">Pastes under 10,000 characters stay inline. Larger ones become files.</span>
                </div>
                {contextMessage ? <p className="success-banner">{contextMessage}</p> : null}
              </div>
            </section>

            <aside className="git-section">
              <div className="git-header">
                <h2>Git status</h2>
                <span>{status.active ? "Live" : "Idle"}</span>
              </div>
              {status.active ? (
                <div className="git-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      void viewDiff();
                    }}
                  >
                    View diff
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
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          void copyLoadedDiff();
                        }}
                        disabled={!diffPanelText}
                      >
                        Copy diff
                      </button>
                    </div>
                  </div>
                  {diffViewer.isLoading ? <p className="git-empty">Loading diff...</p> : null}
                  {!diffViewer.isLoading && diffViewer.error ? <p className="git-empty">{diffViewer.error}</p> : null}
                  {!diffViewer.isLoading && !diffViewer.error && diffEmptyState ? (
                    <p className="git-empty">{diffEmptyState}</p>
                  ) : null}
                  {!diffViewer.isLoading && !diffViewer.error && diffPanelText ? (
                    <pre className="diff-panel">{diffPanelText}</pre>
                  ) : null}
                </div>
              ) : null}
            </aside>
          </div>

          <section className="history-section">
            <div className="history-header">
              <h2>Recent sessions</h2>
              <span>{sessions.length}</span>
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
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        void viewTranscript(session);
                      }}
                    >
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
                      className="secondary"
                      onClick={() => {
                        void copyLoadedTranscript();
                      }}
                      disabled={!transcriptViewer.transcript}
                    >
                      Copy transcript
                    </button>
                  </div>
                </div>
                {transcriptViewer.isLoading ? <p className="history-empty">Loading transcript...</p> : null}
                {!transcriptViewer.isLoading && transcriptViewer.error ? (
                  <p className="history-empty">{transcriptViewer.error}</p>
                ) : null}
                {!transcriptViewer.isLoading && !transcriptViewer.error ? (
                  <pre className="transcript-panel">{transcriptViewer.transcript || "Transcript is empty."}</pre>
                ) : null}
              </div>
            ) : null}
          </section>
        </>
      ) : (
        <section className="settings-section">
          <div className="settings-grid">
            <label className="settings-field">
              <span>Codex executable path</span>
              <input
                type="text"
                value={settingsDraft.codexExecutablePath}
                onChange={(event) =>
                  setSettingsDraft((current) => ({ ...current, codexExecutablePath: event.target.value }))
                }
                placeholder="codex"
              />
            </label>
            <label className="settings-field">
              <span>Default repo root</span>
              <input
                type="text"
                value={settingsDraft.defaultRepoRoot}
                onChange={(event) =>
                  setSettingsDraft((current) => ({ ...current, defaultRepoRoot: event.target.value }))
                }
                placeholder="/home/you"
              />
            </label>
            <label className="settings-field">
              <span>Server bind host</span>
              <input
                type="text"
                value={settingsDraft.serverBindHost}
                onChange={(event) =>
                  setSettingsDraft((current) => ({ ...current, serverBindHost: event.target.value }))
                }
                placeholder="127.0.0.1"
              />
            </label>
            <label className="settings-field">
              <span>Server port</span>
              <input
                type="number"
                value={settingsDraft.serverPort}
                onChange={(event) =>
                  setSettingsDraft((current) => ({ ...current, serverPort: Number(event.target.value) }))
                }
                placeholder="8787"
              />
            </label>
            <label className="settings-field">
              <span>Theme</span>
              <select
                value={settingsDraft.theme}
                onChange={(event) =>
                  setSettingsDraft((current) => ({ ...current, theme: event.target.value as ThemeSetting }))
                }
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
          </div>
          <div className="settings-actions">
            <button type="button" onClick={saveSettings}>
              Save settings
            </button>
            {settingsMessage ? <p className="success-banner">{settingsMessage}</p> : null}
          </div>
          <p className="helper-text">
            Settings are stored in <code>~/.codex-web-console/config.json</code>. Host and port changes apply after a
            server restart.
          </p>
        </section>
      )}

      {error ? <p className="error-banner">{error}</p> : null}
    </div>
  );
}
