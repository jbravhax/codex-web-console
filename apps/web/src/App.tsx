import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { createPastedImageFileName, isSupportedAttachmentName } from "./attachments";
import type { PendingAttachment } from "./attachment-types";
import {
  buildAttachmentAddedMessage,
  buildCopyFailureMessage,
  buildCopySuccessMessage,
  buildLargePasteSavedMessage,
  buildZipUploadSuccessMessage,
  toErrorMessage
} from "./app-feedback";
import type {
  AppSettings,
  CreateProjectOptions,
  CreateProjectResponse,
  DiffViewerState,
  GitStatusSummary,
  RecentProjectItem,
  ServerMessage,
  SessionHistoryItem,
  SessionStatus,
  ThemeSetting,
  TranscriptViewerState
} from "./app-types";
import { ConsoleHeader, ConsoleView } from "./console-panels";
import {
  buildGitDiffEmptyState,
  buildGitDiffPanelText,
  copyGitDiffText,
  loadGitDiff
} from "./git-diff-viewer";
import {
  buildDocumentReference,
  classifyPaste,
  type SavedPromptDocument
} from "./prompt-documents";
import { chooseRepoDirectory } from "./repo-picker";
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
import {
  copyTranscriptText,
  downloadRawTranscript,
  downloadTranscriptMarkdown,
  downloadTranscriptText,
  loadSessionTranscript
} from "./session-transcripts";
import { buildSubmittedPromptInput, detectTerminalOutputState } from "./terminal-session";
import { buildSessionErrorDisplay, buildUnexpectedExitDisplay, isStructuredSessionFailure } from "./session-diagnostics";
import { friendlyUploadErrorMessage } from "./ui-messages";

const DEFAULT_SETTINGS: AppSettings = {
  codexExecutablePath: "codex",
  defaultRepoRoot: "",
  serverBindHost: "127.0.0.1",
  serverPort: 8787,
  theme: "dark"
};

const DEFAULT_CREATE_PROJECT_OPTIONS: CreateProjectOptions = {
  createFolder: true,
  initializeGit: true,
  createReadme: true
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

function formatConnectionState(state: "connecting" | "connected" | "disconnected"): string {
  if (state === "connected") {
    return "Connected";
  }

  if (state === "connecting") {
    return "Connecting";
  }

  return "Offline";
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
  const [repoPickerMessage, setRepoPickerMessage] = useState("");
  const [projectMessage, setProjectMessage] = useState("");
  const [createProjectOptions, setCreateProjectOptions] = useState<CreateProjectOptions>(DEFAULT_CREATE_PROJECT_OPTIONS);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
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
    rawTranscript: "",
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

  const updateRepoPath = (nextPath: string) => {
    setRepoPath(nextPath);
    setProjectMessage("");
    setRepoPickerMessage("");
  };

  const setCopyFeedback = (subject: string, result: Awaited<ReturnType<typeof copyRelativePath>>) => {
    setContextMessage(buildCopySuccessMessage(subject, result));
    setError("");
  };

  const setClipboardFailure = (subject: string, copyError: unknown) => {
    setError(buildCopyFailureMessage(subject, copyError));
  };

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
    terminal.writeln("Enter one real project folder path and start a session.");
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
        const message = toErrorMessage(requestError, "Could not load settings.");
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
        const message = toErrorMessage(requestError, "Could not load recent projects.");
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
        const message = toErrorMessage(requestError, "Could not load recent sessions.");
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
          setError(toErrorMessage(requestError, "Could not load Git status."));
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
        const outputState = detectTerminalOutputState(message.payload);
        if (outputState === "approval") {
          setSessionBanner((current) => reduceSessionBanner(current, { type: "waiting-for-approval" }));
        } else if (outputState === "awaiting-input") {
          setSessionBanner((current) =>
            reduceSessionBanner(current, { type: "waiting-for-input", repoPath: statusRef.current.repoPath })
          );
        } else if (outputState === "completed") {
          setSessionBanner((current) =>
            reduceSessionBanner(current, { type: "completion-detected", repoPath: statusRef.current.repoPath })
          );
        } else if (outputState === "working") {
          setSessionBanner((current) =>
            reduceSessionBanner(current, { type: "activity-detected", repoPath: statusRef.current.repoPath })
          );
        }
        return;
      }

      if (message.type === "exit") {
        setStatus((current) => ({ active: false, repoPath: current.repoPath }));
        const exitDisplay = buildUnexpectedExitDisplay(message.payload);
        if (exitDisplay) {
          setError(`${exitDisplay.detail}\nTechnical details: ${exitDisplay.technicalDetail}`);
        }
        setSessionBanner((current) =>
          reduceSessionBanner(current, {
            type: "exit-received",
            exitCode: message.payload.exitCode,
            signal: message.payload.signal,
            failedDetail: exitDisplay?.detail
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
        const sessionDisplay = isStructuredSessionFailure(message.payload)
          ? buildSessionErrorDisplay(message.payload)
          : {
              detail: friendlyUploadErrorMessage(message.payload),
              technicalDetail: message.payload
            };
        setError(
          sessionDisplay.technicalDetail && sessionDisplay.technicalDetail !== sessionDisplay.detail
            ? `${sessionDisplay.detail}\nTechnical details: ${sessionDisplay.technicalDetail}`
            : sessionDisplay.detail
        );
        setSessionBanner((current) =>
          reduceSessionBanner(current, { type: "error-received", detail: sessionDisplay.detail })
        );
        terminalRef.current?.writeln("");
        terminalRef.current?.writeln(
          `[error] ${typeof message.payload === "string" ? message.payload : message.payload.technicalDetail}`
        );
      }
    };

    socket.onclose = () => {
      setConnectionState("disconnected");
      setStatus((current) => ({ active: false, repoPath: current.repoPath }));
      const detail =
        "The live session disconnected from the local Codex server. If the server stopped, restart it. Then open a new session and try again.";
      setSessionBanner((current) => reduceSessionBanner(current, { type: "websocket-close", detail }));
      setError(`${detail}\nTechnical details: websocket connection closed.`);
    };

    socketRef.current = socket;

    return () => {
      socket.close();
    };
  }, []);

  const startSession = () => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      const detail = "The local server connection is not ready yet.";
      setError(`${detail}\nTechnical details: websocket readyState was not OPEN when start was requested.`);
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
      setError(toErrorMessage(requestError, "Could not save settings."));
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
    setContextMessage(buildLargePasteSavedMessage(document.relativePath, document.charCount));
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
      if (attachment.kind === "zip") {
        setContextMessage(buildZipUploadSuccessMessage(attachment));
      } else {
        setContextMessage(
          buildAttachmentAddedMessage(attachment.relativePath, attachment.mimeType.startsWith("image/") ? "image" : "file")
        );
      }
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
            `Could not save pasted image. ${toErrorMessage(requestError, "Could not save pasted image.")}`
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
      setError(friendlyUploadErrorMessage(pasteHandling.message));
      return;
    }

    setError("");
    setContextMessage("");

    try {
      await saveLargePaste(pastedText);
    } catch (requestError) {
      setError(
        friendlyUploadErrorMessage(
          `Could not save pasted context. ${toErrorMessage(requestError, "Could not save pasted context.")}`
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
        friendlyUploadErrorMessage(
          `Could not upload attachment. ${toErrorMessage(requestError, "Could not upload attachment.")}`
        )
      );
    } finally {
      event.target.value = "";
    }
  };

  const handleDrop = async (event: DragEvent<HTMLElement>) => {
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
          `Could not upload dropped files. ${toErrorMessage(requestError, "Could not upload dropped files.")}`
        )
      );
    }
  };

  const handleChooseRepo = async () => {
    setError("");
    setRepoPickerMessage("");
    setProjectMessage("");

    try {
      const result = await chooseRepoDirectory();

      if (result.kind === "selected") {
        updateRepoPath(result.repoPath);
        setRepoPickerMessage(`Selected ${result.repoPath}.`);
        return;
      }

      if (result.kind === "unsupported" || result.kind === "missing-path") {
        setRepoPickerMessage(result.message);
        return;
      }

      if (result.kind === "cancelled") {
        setRepoPickerMessage("Folder selection was canceled. You can paste the full project folder path manually or try the picker again.");
      }
    } catch {
      setError("Could not open the folder picker. Paste the full project folder path manually.");
    }
  };

  const createProjectFolder = async () => {
    setError("");
    setRepoPickerMessage("");
    setProjectMessage("");
    setIsCreatingProject(true);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          repoPath,
          ...createProjectOptions
        })
      });

      const payload = (await response.json()) as CreateProjectResponse | { error?: string };
      if (!response.ok || !("repoPath" in payload)) {
        throw new Error(
          payload && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Could not create the project folder."
        );
      }

      const project = payload as CreateProjectResponse;
      updateRepoPath(project.repoPath);
      setProjectMessage(`${project.message} You can start a Codex session in it now.`);
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Could not create the project folder."));
    } finally {
      setIsCreatingProject(false);
    }
  };

  const removeAttachment = (attachmentId: string) => {
    setPendingContextItems((current) => removePendingContextById(current, attachmentId));
  };

  const clearAllPendingContext = () => {
    setPendingContextItems(clearPendingContext());
    setContextMessage("Cleared all pending context for the next prompt.");
  };

  const copyItemRelativePath = async (relativePath: string) => {
    try {
      const result = await copyRelativePath(relativePath);
      setCopyFeedback(relativePath, result);
    } catch (copyError) {
      setClipboardFailure("that relative path", copyError);
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
    socketRef.current?.send(JSON.stringify({ type: "input", data: buildSubmittedPromptInput(composedPrompt) }));
    setSessionBanner((current) => reduceSessionBanner(current, { type: "prompt-submitted" }));
    terminalRef.current?.writeln(`\n[web prompt sent]\n${composedPrompt}\n`);
    setPromptText("");
    setPendingContextItems([]);
    promptInputRef.current?.focus();
  };

  const copyPromptPreview = async () => {
    try {
      const result = await copyGeneratedPromptContext(generatedPromptPreview);
      setCopyFeedback("exactly what Codex will receive", result);
    } catch (copyError) {
      setClipboardFailure("the prompt preview", copyError);
    }
  };

  const viewTranscript = async (session: SessionHistoryItem) => {
    setTranscriptViewer({
      session,
      transcript: "",
      rawTranscript: "",
      isLoading: true,
      error: ""
    });

    try {
      const transcript = await loadSessionTranscript(session.id);
      setTranscriptViewer({
        session,
        transcript,
        rawTranscript: "",
        isLoading: false,
        error: ""
      });
    } catch (requestError) {
      setTranscriptViewer({
        session,
        transcript: "",
        rawTranscript: "",
        isLoading: false,
        error: toErrorMessage(requestError, "Could not load transcript.")
      });
    }
  };

  const copyLoadedTranscript = async () => {
    if (!transcriptViewer.transcript) {
      return;
    }

    try {
      const result = await copyTranscriptText(transcriptViewer.transcript);
      setCopyFeedback("the transcript", result);
    } catch (copyError) {
      setClipboardFailure("the transcript", copyError);
    }
  };

  const downloadLoadedTranscriptText = () => {
    if (!transcriptViewer.session || !transcriptViewer.transcript) {
      return;
    }

    downloadTranscriptText(transcriptViewer.session, transcriptViewer.transcript);
    setContextMessage("Downloaded the cleaned transcript as a text file.");
    setError("");
  };

  const downloadLoadedTranscriptMarkdown = () => {
    if (!transcriptViewer.session || !transcriptViewer.transcript) {
      return;
    }

    downloadTranscriptMarkdown(transcriptViewer.session, transcriptViewer.transcript);
    setContextMessage("Downloaded the cleaned transcript as a markdown file.");
    setError("");
  };

  const downloadLoadedRawTranscript = async () => {
    if (!transcriptViewer.session) {
      return;
    }

    try {
      const rawTranscript =
        transcriptViewer.rawTranscript || (await loadSessionTranscript(transcriptViewer.session.id, "raw"));
      setTranscriptViewer((current) =>
        current.session?.id === transcriptViewer.session?.id ? { ...current, rawTranscript } : current
      );
      downloadRawTranscript(transcriptViewer.session, rawTranscript);
      setContextMessage("Downloaded the raw terminal transcript for debugging.");
      setError("");
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Could not download the raw transcript."));
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
        error: toErrorMessage(requestError, "Could not load Git diff.")
      });
    }
  };

  const copyLoadedDiff = async () => {
    if (!diffPanelText) {
      return;
    }

    try {
      const result = await copyGitDiffText(diffPanelText);
      setCopyFeedback("the diff", result);
    } catch (copyError) {
      setClipboardFailure("the diff", copyError);
    }
  };

  const pendingContextEmptyState = !status.active
    ? "Start a session in a real project folder, then add documents, files, images, or ZIP context for Codex."
    : "Paste text, drop files, upload images, or add a ZIP for Codex to inspect.";
  const promptPreviewSummary = generatedPromptPreview.trim()
    ? `${promptText.trim() ? "Prompt ready" : "Context ready"} with ${readyPendingItemCount} context item${readyPendingItemCount === 1 ? "" : "s"} prepared for Codex.`
    : "Nothing will be sent yet. Add a prompt or context to preview the final message.";

  return (
    <div className="app-shell">
      <ConsoleHeader activeView={activeView} onChangeView={setActiveView} sessionBanner={sessionBanner} />

      {activeView === "console" ? (
        <ConsoleView
          projectControls={{
            status,
            repoPath,
            onRepoPathChange: updateRepoPath,
            onChooseRepo: handleChooseRepo,
            repoPickerMessage,
            projectMessage,
            createProjectOptions,
            onCreateProjectOptionChange: setCreateProjectOptions,
            onCreateProject: () => {
              void createProjectFolder();
            },
            isCreatingProject,
            onStartSession: startSession,
            onStopSession: stopSession,
            connectionStateLabel: formatConnectionState(connectionState),
            defaultRepoRoot: settings.defaultRepoRoot,
            isLoadingSettings,
            recentProjects,
            isLoadingRecentProjects
          }}
          pendingContextPanel={{
            pendingContextItems,
            readyPendingItemCount,
            pendingContextEmptyState,
            pendingContextPreviewLines,
            onClearAll: clearAllPendingContext,
            onCopyRelativePath: (relativePath) => {
              void copyItemRelativePath(relativePath);
            },
            onRemoveAttachment: removeAttachment
          }}
          composerPanel={{
            status,
            sessionBanner,
            promptText,
            onPromptTextChange: setPromptText,
            onPromptPaste: handlePromptPaste,
            onDrop: handleDrop,
            onFileSelection: handleFileSelection,
            fileInputRef,
            promptInputRef,
            promptPreviewSummary,
            promptPreviewSections,
            generatedPromptPreview,
            isPromptPreviewExpanded,
            onTogglePromptPreview: () => setIsPromptPreviewExpanded((current) => !current),
            onCopyPromptPreview: () => {
              void copyPromptPreview();
            },
            onSendPrompt: sendPrompt,
            contextMessage
          }}
          repoInsightsPanel={{
            status,
            gitStatus,
            isLoadingGitStatus,
            diffViewer,
            diffPanelText,
            diffEmptyState,
            onViewDiff: () => {
              void viewDiff();
            },
            onCopyDiff: () => {
              void copyLoadedDiff();
            }
          }}
          sessionHistoryPanel={{
            sessions,
            isLoadingSessions,
            transcriptViewer,
            onViewTranscript: (session) => {
              void viewTranscript(session);
            },
            onCopyTranscript: () => {
              void copyLoadedTranscript();
            },
            onDownloadTranscriptText: downloadLoadedTranscriptText,
            onDownloadTranscriptMarkdown: downloadLoadedTranscriptMarkdown,
            onDownloadRawTranscript: () => {
              void downloadLoadedRawTranscript();
            },
            formatDuration
          }}
          status={status}
          sessionBanner={sessionBanner}
          terminalContainerRef={terminalContainerRef}
        />
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
