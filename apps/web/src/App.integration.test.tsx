import { createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import * as clipboardModule from "./clipboard";
import { loadGitDiff } from "./git-diff-viewer";
import { REPO_PICKER_UNSUPPORTED_MESSAGE, chooseRepoDirectory } from "./repo-picker";
import { loadSessionTranscript } from "./session-transcripts";
import { buildPromptPasteInput, buildPromptSubmitInput } from "./terminal-session";

vi.mock("@xterm/xterm", () => {
  class TerminalMock {
    onData = vi.fn();
    onResize = vi.fn();
    loadAddon = vi.fn();
    open = vi.fn();
    fit = vi.fn();
    writeln = vi.fn();
    write = vi.fn();
    clear = vi.fn();
    dispose = vi.fn();
  }

  return {
    Terminal: TerminalMock
  };
});

vi.mock("@xterm/addon-fit", () => {
  class FitAddonMock {
    fit = vi.fn();
    proposeDimensions = vi.fn(() => ({ cols: 120, rows: 32 }));
  }

  return {
    FitAddon: FitAddonMock
  };
});

vi.mock("./repo-picker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./repo-picker")>();
  return {
    ...actual,
    chooseRepoDirectory: vi.fn(actual.chooseRepoDirectory)
  };
});

vi.mock("./git-diff-viewer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./git-diff-viewer")>();
  return {
    ...actual,
    loadGitDiff: vi.fn(actual.loadGitDiff)
  };
});

vi.mock("./session-transcripts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./session-transcripts")>();
  return {
    ...actual,
    loadSessionTranscript: vi.fn(actual.loadSessionTranscript)
  };
});

type FetchResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.onclose?.({});
  }

  emitOpen() {
    this.onopen?.();
  }

  emitMessage(payload: unknown) {
    this.onmessage?.({
      data: JSON.stringify(payload)
    });
  }

  emitClose(event?: { code?: number; reason?: string }) {
    this.onclose?.(event ?? {});
  }
}

function createFetchResponse(jsonPayload: unknown, ok = true): FetchResponse {
  return {
    ok,
    json: async () => jsonPayload,
    text: async () => (typeof jsonPayload === "string" ? jsonPayload : JSON.stringify(jsonPayload))
  };
}

function installFetchMock(overrides?: {
  settings?: unknown;
  recentProjects?: unknown;
  sessions?: unknown;
  gitStatus?: unknown;
  readiness?: unknown;
  documents?: { ok: boolean; payload: unknown };
  projects?: { ok: boolean; payload: unknown };
}) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    if (input === "/api/settings") {
      return createFetchResponse(
        overrides?.settings ?? {
          codexExecutablePath: "codex",
          defaultRepoRoot: "/workspace/default-project",
          serverBindHost: "127.0.0.1",
          serverPort: 8787,
          theme: "dark"
        }
      );
    }

    if (input === "/api/recent-projects") {
      return createFetchResponse(overrides?.recentProjects ?? { items: [] });
    }

    if (input === "/api/sessions") {
      return createFetchResponse(overrides?.sessions ?? { items: [] });
    }

    if (input.startsWith("/api/git/status?repoPath=")) {
      return createFetchResponse(
        overrides?.gitStatus ?? {
          repoPath: "/workspace/default-project",
          isGitRepo: true,
          branch: "main",
          changedFilesCount: 1,
          stagedFilesCount: 0,
          untrackedFilesCount: 0
        }
      );
    }

    if (input.startsWith("/api/readiness?repoPath=")) {
      return createFetchResponse(
        overrides?.readiness ?? {
          overallStatus: "passed",
          canStart: true,
          checkedAt: "2026-06-22T21:00:00.000Z",
          repoPath: "/workspace/default-project",
          items: [
            {
              key: "codex-executable",
              status: "passed",
              message: "Codex is available as codex.",
              recommendedAction: "No action needed."
            },
            {
              key: "git-executable",
              status: "passed",
              message: "Git is available for repo status, diffs, and Git setup.",
              recommendedAction: "No action needed."
            }
          ]
        }
      );
    }

    if (input === "/api/documents" && init?.method === "POST") {
      return createFetchResponse(
        overrides?.documents?.payload ?? {
          filePath: "/workspace/default-project/.codex-web/documents/pasted-20260621-120000.md",
          relativePath: ".codex-web/documents/pasted-20260621-120000.md",
          charCount: 12000
        },
        overrides?.documents?.ok ?? true
      );
    }

    if (input === "/api/projects" && init?.method === "POST") {
      return createFetchResponse(
        overrides?.projects?.payload ?? {
          repoPath: "/workspace/new-project",
          createdFolder: true,
          initializedGit: true,
          createdReadme: true,
          message: "Project created at /workspace/new-project: created the folder, initialized Git, added README.md."
        },
        overrides?.projects?.ok ?? true
      );
    }

    throw new Error(`Unhandled fetch request: ${input}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderApp(options?: {
  settings?: unknown;
  recentProjects?: unknown;
  sessions?: unknown;
  gitStatus?: unknown;
  readiness?: unknown;
  documents?: { ok: boolean; payload: unknown };
  projects?: { ok: boolean; payload: unknown };
}) {
  installFetchMock(options);
  render(<App />);

  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  if (!socket) {
    throw new Error("Expected App to create a WebSocket connection.");
  }

  socket.emitOpen();
  return socket;
}

function emitSessionStatus(socket: FakeWebSocket, active: boolean, repoPath: string | null) {
  socket.emitMessage({
    type: "status",
    payload: {
      active,
      repoPath,
      startedAt: active ? "2026-06-22T21:10:00.000Z" : null
    }
  });
}

function createDeferredPromise<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

function getMenuButton(name: "Workspace" | "Project" | "Context" | "Transcript" | "Changes") {
  const nav = screen.getByRole("navigation", { name: "Primary navigation" });
  return within(nav).getByRole("button", {
    name: (accessibleName) => accessibleName.trim().startsWith(name)
  });
}

async function openMenuPage(name: "Context" | "Transcript" | "Changes" | "Project" | "Workspace") {
  fireEvent.click(getMenuButton(name));
  await waitFor(() => {
    expect(getMenuButton(name).className).toContain("selected");
  });
}

async function openProjectPage() {
  await openMenuPage("Project");
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.mocked(chooseRepoDirectory).mockReset();
  vi.mocked(loadGitDiff).mockReset();
  vi.mocked(loadSessionTranscript).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("App integration", () => {
  it("shows repo picker guidance when the browser does not support choosing folders", async () => {
    vi.mocked(chooseRepoDirectory).mockResolvedValue({
      kind: "unsupported",
      message: REPO_PICKER_UNSUPPORTED_MESSAGE
    });

    renderApp();

    await openProjectPage();
    fireEvent.click(screen.getByRole("button", { name: "Choose project" }));

    expect(await screen.findByText(REPO_PICKER_UNSUPPORTED_MESSAGE)).toBeTruthy();
    expect(screen.getByText(/Paste a full path or try the browser picker when it works/i)).toBeTruthy();
  });

  it("shows environment readiness details for the selected project", async () => {
    renderApp({
      readiness: {
        overallStatus: "warning",
        canStart: true,
        checkedAt: "2026-06-22T21:00:00.000Z",
        repoPath: "/workspace/default-project",
        items: [
          {
            key: "codex-executable",
            status: "passed",
            message: "Codex is available as codex.",
            recommendedAction: "No action needed."
          },
          {
            key: "git-executable",
            status: "warning",
            message: "Git is not available on this machine right now.",
            recommendedAction: "Install Git if you want repo status, diff inspection, or Git initialization from the app."
          }
        ]
      }
    });

    await openProjectPage();
    fireEvent.change(screen.getByLabelText("Project folder path"), {
      target: {
        value: "/workspace/default-project"
      }
    });
    expect(await screen.findByText("Readiness")).toBeTruthy();
    const readinessSection = screen.getByText("Readiness").closest("section");
    if (!readinessSection) {
      throw new Error("Expected readiness section.");
    }

    fireEvent.click(within(readinessSection).getByRole("button", { name: "Show" }));
    expect(await screen.findByText("Git is not available on this machine right now.")).toBeTruthy();
    expect(screen.getByText("You can start this workspace.")).toBeTruthy();
  });

  it("creates a new project folder and reuses the chosen path for session start", async () => {
    renderApp();

    await openProjectPage();
    fireEvent.change(screen.getByLabelText("Project folder path"), {
      target: {
        value: "/workspace/new-project"
      }
    });

    const createProjectSection = screen.getByText("Create new project").closest("section");
    if (!createProjectSection) {
      throw new Error("Expected create-project section.");
    }

    fireEvent.click(within(createProjectSection).getByRole("button", { name: "Show" }));
    fireEvent.click(within(createProjectSection).getByRole("button", { name: "Create new project" }));

    expect(await screen.findByText(/Project created at \/workspace\/new-project/i)).toBeTruthy();
    expect((screen.getByLabelText("Project folder path") as HTMLInputElement).value).toBe("/workspace/new-project");
  });

  it("uses the left rail to switch between project and the unified workspace", async () => {
    const socket = renderApp();

    expect(await screen.findByText("Guide Codex intentionally")).toBeTruthy();
    await openProjectPage();
    expect(await screen.findByText("Project setup")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Project folder path"), {
      target: {
        value: "/workspace/default-project"
      }
    });

    expect(screen.queryByRole("button", { name: "Compose view" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Live run view" })).toBeNull();
    fireEvent.click(getMenuButton("Workspace"));
    expect(await screen.findByText("Guide Codex intentionally")).toBeTruthy();
    expect(screen.queryByText("Project setup")).toBeNull();
    expect(screen.getByText("Passed")).toBeTruthy();

    emitSessionStatus(socket, true, "/workspace/default-project");
    expect(await screen.findByText("Codex terminal")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Project" }));
    expect(await screen.findByText("Project setup")).toBeTruthy();
  });

  it("walks the session banner through idle, starting, running, stopping, and stopped states", async () => {
    const socket = renderApp();

    expect(await screen.findByText("No session running")).toBeTruthy();
    await openProjectPage();

    fireEvent.change(screen.getByLabelText("Project folder path"), {
      target: {
        value: "/workspace/default-project"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Start session" }));
    expect(await screen.findByText("Starting session")).toBeTruthy();

    emitSessionStatus(socket, true, "/workspace/default-project");
    expect((await screen.findAllByText("Session running")).length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: "Stop session" }));
    expect(screen.getAllByText("Stopping session").length).toBeGreaterThanOrEqual(1);

    socket.emitMessage({
      type: "exit",
      payload: {
        exitCode: 0,
        signal: 15
      }
    });

    expect((await screen.findAllByText("Session stopped")).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/The stop request finished and Codex exited/i)).toBeNull();
  });

  it("blocks session start when readiness reports a hard failure", async () => {
    const socket = renderApp({
      readiness: {
        overallStatus: "failed",
        canStart: false,
        checkedAt: "2026-06-22T21:00:00.000Z",
        repoPath: "/workspace/missing-project",
        items: [
          {
            key: "project-folder",
            status: "failed",
            message: "That project folder does not exist yet.",
            recommendedAction: "Create it first, then choose that specific project folder again."
          }
        ]
      }
    });

    await openProjectPage();
    fireEvent.change(screen.getByLabelText("Project folder path"), {
      target: {
        value: "/workspace/missing-project"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Start session" }));

    expect((await screen.findAllByText("That project folder does not exist yet.")).length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText(/Next step: Create it first/i)).toBeTruthy();
    expect(socket.sent).not.toContain(
      JSON.stringify({ type: "start", repoPath: "/workspace/missing-project", resumeLast: false })
    );
  });

  it("shows parent-folder guidance before session start when the chosen path looks too broad", async () => {
    renderApp({
      readiness: {
        overallStatus: "failed",
        canStart: false,
        checkedAt: "2026-06-22T21:00:00.000Z",
        repoPath: "/workspace/Projects",
        items: [
          {
            key: "project-folder",
            status: "failed",
            message:
              "That folder looks like a broad parent directory that contains multiple projects. Open one specific project folder inside it instead.",
            recommendedAction:
              "This looks like a parent folder. Choose the specific project folder you want Codex to work in."
          }
        ]
      }
    });

    await openProjectPage();
    fireEvent.change(screen.getByLabelText("Project folder path"), {
      target: {
        value: "/workspace/Projects"
      }
    });
    const readinessSection = screen.getByText("Readiness").closest("section");
    if (!readinessSection) {
      throw new Error("Expected readiness section.");
    }

    fireEvent.click(within(readinessSection).getByRole("button", { name: "Show" }));
    expect(await screen.findByText(/broad parent directory/i)).toBeTruthy();
    expect(await screen.findByText(/choose the specific project folder you want codex to work in/i)).toBeTruthy();
  });

  it("shows the generated prompt preview when expanded", async () => {
    const socket = renderApp();
    emitSessionStatus(socket, true, "/workspace/default-project");
    expect(await screen.findByText("Codex terminal")).toBeTruthy();
    fireEvent.click(getMenuButton("Workspace"));
    expect(await screen.findByText("Guide Codex intentionally")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: {
        value: "Review this repository"
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));

    expect(await screen.findByText("Full generated prompt")).toBeTruthy();
    expect(screen.getByText("User prompt text")).toBeTruthy();
    expect(screen.getAllByText("Review this repository").length).toBeGreaterThanOrEqual(2);
  });

  it("submits the prompt in one send action and shows waiting banner updates", async () => {
    const socket = renderApp();
    emitSessionStatus(socket, true, "/workspace/default-project");
    expect(await screen.findByText("Codex terminal")).toBeTruthy();
    fireEvent.click(getMenuButton("Workspace"));
    expect(await screen.findByText("Guide Codex intentionally")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: {
        value: "Reply with exactly: OK"
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "Send prompt" }));

    expect((await screen.findAllByText("Running request")).length).toBeGreaterThanOrEqual(1);
    await waitFor(() => {
      expect(socket.sent).toContain(
        JSON.stringify({
          type: "input",
          data: buildPromptPasteInput("Reply with exactly: OK")
        })
      );
      expect(socket.sent).toContain(
        JSON.stringify({
          type: "input",
          data: buildPromptSubmitInput()
        })
      );
    });

    socket.emitMessage({
      type: "output",
      payload: "Would you like to run the following command?\nPress enter to confirm"
    });
    expect((await screen.findAllByText("Waiting for approval")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/approve in the terminal and work will continue automatically/i).length).toBeGreaterThan(0);
    expect(document.querySelector('[data-session-state="awaiting-approval"]')).toBeTruthy();
    expect(document.querySelector(".session-banner-awaiting-approval")).toBeNull();

    socket.emitMessage({
      type: "output",
      payload: "Created only README.md."
    });
    expect((await screen.findAllByText("Codex is responding")).length).toBeGreaterThanOrEqual(1);
  });

  it("continues the latest resumable session for the selected project", async () => {
    const socket = renderApp({
      sessions: {
        items: [
          {
            id: "session-continue",
            repoPath: "/workspace/default-project",
            startTime: "2026-06-22T21:10:00.000Z",
            endTime: "2026-06-22T21:12:00.000Z",
            durationMs: 120000,
            resumeAvailable: true
          }
        ]
      }
    });

    await openProjectPage();
    fireEvent.change(screen.getByLabelText("Project folder path"), {
      target: {
        value: "/workspace/default-project"
      }
    });

    fireEvent.click(await screen.findByRole("button", { name: "Continue session" }));

    await waitFor(() => {
      expect(socket.sent).toContain(
        JSON.stringify({
          type: "start",
          repoPath: "/workspace/default-project",
          resumeLast: true
        })
      );
    });
  });

  it("submits with Enter and keeps Shift+Enter available for a new line", async () => {
    const socket = renderApp();
    emitSessionStatus(socket, true, "/workspace/default-project");
    expect(await screen.findByText("Codex terminal")).toBeTruthy();

    const prompt = screen.getByLabelText("Prompt");
    fireEvent.change(prompt, {
      target: {
        value: "Reply with exactly: OK"
      }
    });

    const submitEvent = createEvent.keyDown(prompt, { key: "Enter", code: "Enter" });
    fireEvent(prompt, submitEvent);
    expect(submitEvent.defaultPrevented).toBe(true);

    await waitFor(() => {
      expect(socket.sent).toContain(
        JSON.stringify({
          type: "input",
          data: buildPromptPasteInput("Reply with exactly: OK")
        })
      );
      expect(socket.sent).toContain(
        JSON.stringify({
          type: "input",
          data: buildPromptSubmitInput()
        })
      );
    });

    fireEvent.change(prompt, {
      target: {
        value: "Line one"
      }
    });

    const beforeShiftEnter = socket.sent.length;
    const newlineEvent = createEvent.keyDown(prompt, { key: "Enter", code: "Enter", shiftKey: true });
    fireEvent(prompt, newlineEvent);
    expect(newlineEvent.defaultPrevented).toBe(false);
    expect(socket.sent).toHaveLength(beforeShiftEnter);
  });

  it("shows explicit browser guidance when codex is waiting for input, completed, or disconnected", async () => {
    const socket = renderApp();
    emitSessionStatus(socket, true, "/workspace/default-project");

    socket.emitMessage({
      type: "output",
      payload: "› Run /review on my current changes"
    });
    expect((await screen.findAllByText("Waiting for your next input")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/waiting for your next instruction/i).length).toBeGreaterThan(0);

    socket.emitMessage({
      type: "output",
      payload: "Created only README.md.\n\n─ Worked for 1m 23s ─"
    });
    expect((await screen.findAllByText("Request completed")).length).toBeGreaterThanOrEqual(1);
    await waitFor(() => {
      expect(document.querySelector(".results-summary-card")).toBeTruthy();
    });
    expect(screen.getByText(/The latest session output stays here while you review it/i)).toBeTruthy();

    socket.emitClose({ code: 1006, reason: "server stopped" });
    expect((await screen.findAllByText("Disconnected")).length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText("Disconnected at")).toBeTruthy();
    expect(
      (
        await screen.findAllByText(
          /start a new session because this app does not resume a live terminal connection yet/i
        )
      ).length
    ).toBeGreaterThan(0);
    expect(await screen.findByText(/Technical details: websocket connection closed with code 1006. Reason: server stopped/i)).toBeTruthy();
  });

  it("shows specific repo validation errors instead of generic attachment guidance", async () => {
    const socket = renderApp();

    socket.emitMessage({
      type: "error",
      payload: {
        category: "repo-path-does-not-exist",
        userMessage:
          "That project folder does not exist yet. Create it first, then start Codex in that specific folder.",
        technicalDetail: "The path does not exist: /workspace/missing-project"
      }
    });

    const repoPathMessages = await screen.findAllByText(/That project folder does not exist yet/i);
    expect(repoPathMessages.length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText(/Technical details: The path does not exist: \/workspace\/missing-project/i)).toBeTruthy();
  });

  it("shows create-project failures clearly without overwriting the current path", async () => {
    renderApp({
      projects: {
        ok: false,
        payload: {
          error: "That folder already exists and is not empty. Choose a new folder path instead so existing data is not overwritten."
        }
      }
    });

    await openProjectPage();
    fireEvent.change(screen.getByLabelText("Project folder path"), {
      target: {
        value: "/workspace/existing-project"
      }
    });

    const createProjectSection = screen.getByText("Create new project").closest("section");
    if (!createProjectSection) {
      throw new Error("Expected create-project section.");
    }

    fireEvent.click(within(createProjectSection).getByRole("button", { name: "Show" }));
    fireEvent.click(within(createProjectSection).getByRole("button", { name: "Create new project" }));

    expect(await screen.findByText(/already exists and is not empty/i)).toBeTruthy();
    expect((screen.getByLabelText("Project folder path") as HTMLInputElement).value).toBe("/workspace/existing-project");
  });

  it("keeps lower-frequency project setup tools collapsed until needed", async () => {
    renderApp();

    await openProjectPage();

    expect(screen.queryByText("Initialize Git repository")).toBeNull();
    expect(screen.queryByText("No previous projects yet.")).toBeNull();

    const createProjectSection = screen.getByText("Create new project").closest("section");
    if (!createProjectSection) {
      throw new Error("Expected create-project section.");
    }

    fireEvent.click(within(createProjectSection).getByRole("button", { name: "Show" }));
    expect(await screen.findByText("Initialize Git repository")).toBeTruthy();

    const recentProjectsSection = screen.getByText("Recent projects").closest("section");
    if (!recentProjectsSection) {
      throw new Error("Expected recent-projects section.");
    }

    fireEvent.click(within(recentProjectsSection).getByRole("button", { name: "Show" }));
    expect(await screen.findByText("No previous projects yet.")).toBeTruthy();
  });

  it("shows clear guidance when the selected folder looks like a broad parent directory", async () => {
    const socket = renderApp();

    socket.emitMessage({
      type: "error",
      payload: {
        category: "invalid-repo-path",
        userMessage:
          "That folder looks like a parent directory that contains multiple projects. Open one specific project folder inside it instead of the parent Projects folder.",
        technicalDetail:
          "That folder looks like a broad parent directory that contains multiple projects. Open one specific project folder inside it instead."
      }
    });

    expect((await screen.findAllByText(/contains multiple projects/i)).length).toBeGreaterThanOrEqual(1);
    expect((await screen.findAllByText(/specific project folder inside it/i)).length).toBeGreaterThanOrEqual(1);
  });

  it("shows actionable diagnostics when codex is not installed or exits unexpectedly", async () => {
    const socket = renderApp();

    socket.emitMessage({
      type: "error",
      payload: {
        category: "codex-not-found",
        userMessage:
          "Codex could not be started because the configured executable was not found. Check the Codex executable path in Settings and make sure Codex is installed on this machine.",
        technicalDetail: "spawn codex ENOENT"
      }
    });

    expect((await screen.findAllByText(/configured executable was not found/i)).length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText(/Technical details: spawn codex ENOENT/i)).toBeTruthy();

    emitSessionStatus(socket, true, "/workspace/default-project");
    socket.emitMessage({
      type: "exit",
      payload: {
        exitCode: 1,
        signal: 0,
        startedAt: "2026-06-22T21:12:00.000Z",
        endedAt: "2026-06-22T21:13:30.000Z",
        failure: {
          category: "sandbox-unavailable",
          userMessage:
            "Codex could not finish starting its Linux sandbox for /workspace/default-project. Make sure bubblewrap is installed and that this Linux host allows the required user namespace setup.",
          technicalDetail: "bubblewrap needs access to create user namespaces"
        }
      }
    });

    expect((await screen.findAllByText("Session failed")).length).toBeGreaterThanOrEqual(1);
    expect((await screen.findAllByText(/could not finish starting its linux sandbox/i)).length).toBeGreaterThanOrEqual(1);
  });

  it("writes exit diagnostics into the terminal summary for completed sessions", async () => {
    const socket = renderApp();
    emitSessionStatus(socket, true, "/workspace/default-project");

    socket.emitMessage({
      type: "exit",
      payload: {
        exitCode: 0,
        signal: 15,
        startedAt: "2026-06-22T21:15:00.000Z",
        endedAt: "2026-06-22T21:16:00.000Z",
        failure: null
      }
    });

    expect((await screen.findAllByText("Session completed")).length).toBeGreaterThanOrEqual(1);
    await waitFor(() => {
      expect(document.querySelector(".results-summary-card")).toBeTruthy();
    });
    expect((await screen.findAllByText("Last activity")).length).toBeGreaterThanOrEqual(1);
  });

  it("shows an empty preview state when nothing is queued", async () => {
    const socket = renderApp();
    emitSessionStatus(socket, true, "/workspace/default-project");
    expect((await screen.findAllByText("Session running")).length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));

    expect(await screen.findByText("Nothing queued yet")).toBeTruthy();
    expect(screen.getByText("Nothing will be sent yet. Add a prompt or context to build the final message.")).toBeTruthy();
  });

  it("shows intentional empty states in each utility mode", async () => {
    renderApp();

    await openMenuPage("Context");
    expect(await screen.findByText("No context added yet. Start a session first.")).toBeTruthy();

    await openMenuPage("Transcript");
    await waitFor(() => {
      expect(screen.queryByText("Loading recent sessions...")).toBeNull();
    });
    expect(await screen.findByText("No transcript yet")).toBeTruthy();
    expect(screen.getByText("Finish a session to review output here.")).toBeTruthy();

    await openMenuPage("Changes");
    expect(await screen.findByText("No changes yet. Start a session to inspect the project.")).toBeTruthy();
  });

  it("saves large pasted text as document context and explains the file reference", async () => {
    const socket = renderApp();
    emitSessionStatus(socket, true, "/workspace/default-project");
    expect((await screen.findAllByText("Session running")).length).toBeGreaterThanOrEqual(1);

    fireEvent.paste(screen.getByLabelText("Prompt"), {
      clipboardData: {
        items: [],
        getData: () => "x".repeat(10000)
      }
    });

    expect(await screen.findByText(/Saved 12,000 characters to \.codex-web\/documents\/pasted-20260621-120000\.md\./)).toBeTruthy();
    await openMenuPage("Context");
    expect(screen.getByText("Large pasted documents")).toBeTruthy();
    expect(screen.getByText(".codex-web/documents/pasted-20260621-120000.md")).toBeTruthy();
  });

  it("shows a friendly large-paste failure message", async () => {
    const socket = renderApp();
    emitSessionStatus(socket, true, "/workspace/default-project");
    expect((await screen.findAllByText("Session running")).length).toBeGreaterThanOrEqual(1);

    fireEvent.paste(screen.getByLabelText("Prompt"), {
      clipboardData: {
        items: [],
        getData: () => "x".repeat(1024 * 1024 + 1)
      }
    });

    expect(
      await screen.findByText(
        "Could not save that pasted text. It is over the current 1MB limit, so split it into smaller pieces, attach an existing file instead, or upload a ZIP for a larger project bundle."
      )
    ).toBeTruthy();
  });

  it("clears all pending context after adding a saved document", async () => {
    const socket = renderApp();
    emitSessionStatus(socket, true, "/workspace/default-project");
    expect((await screen.findAllByText("Session running")).length).toBeGreaterThanOrEqual(1);

    fireEvent.paste(screen.getByLabelText("Prompt"), {
      clipboardData: {
        items: [],
        getData: () => "x".repeat(10000)
      }
    });

    await openMenuPage("Context");
    expect(await screen.findByText("Large pasted documents")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    expect(await screen.findByText("Cleared all pending context for the next prompt.")).toBeTruthy();
    expect(screen.queryByText("Large pasted documents")).toBeNull();
  });

  it("loads a transcript successfully and shows transcript errors gracefully", async () => {
    vi.mocked(loadSessionTranscript)
      .mockResolvedValueOnce("session transcript text")
      .mockRejectedValueOnce(new Error("Session transcript not found."));

    renderApp({
      sessions: {
        items: [
          {
            id: "session-1",
            repoPath: "/workspace/project-one",
            startTime: "2026-06-21T12:00:00.000Z",
            endTime: "2026-06-21T12:02:00.000Z",
            durationMs: 120000
          },
          {
            id: "session-2",
            repoPath: "/workspace/project-two",
            startTime: "2026-06-21T13:00:00.000Z",
            endTime: "2026-06-21T13:03:00.000Z",
            durationMs: 180000
          }
        ]
      }
    });

    await openMenuPage("Transcript");
    const transcriptButtons = await screen.findAllByRole("button", { name: "View transcript" });

    fireEvent.click(transcriptButtons[0]);
    expect(await screen.findByText("Loading transcript...")).toBeTruthy();
    expect(await screen.findByText("session transcript text")).toBeTruthy();

    await openMenuPage("Transcript");
    fireEvent.click((await screen.findAllByRole("button", { name: "View transcript" }))[1]);
    expect(await screen.findByText("Session transcript not found.")).toBeTruthy();
  });

  it("keeps transcript export actions available inside the focused transcript mode", async () => {
    vi.mocked(loadSessionTranscript).mockResolvedValueOnce("session transcript text");

    renderApp({
      sessions: {
        items: [
          {
            id: "session-1",
            repoPath: "/workspace/project-one",
            startTime: "2026-06-21T12:00:00.000Z",
            endTime: "2026-06-21T12:02:00.000Z",
            durationMs: 120000
          }
        ]
      }
    });

    await openMenuPage("Transcript");
    fireEvent.click((await screen.findAllByRole("button", { name: "View transcript" }))[0]);
    await screen.findByText("session transcript text");
    expect(await screen.findByRole("button", { name: "Download .txt" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download raw" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Transcript" }).className).toContain("selected");
  });

  it("shows a fallback success message when copy uses the browser fallback", async () => {
    vi.spyOn(clipboardModule, "copyTextWithFallback").mockResolvedValue({
      method: "fallback",
      clipboardBlocked: true
    });

    vi.mocked(loadSessionTranscript).mockResolvedValueOnce("session transcript text");

    renderApp({
      sessions: {
        items: [
          {
            id: "session-1",
            repoPath: "/workspace/project-one",
            startTime: "2026-06-21T12:00:00.000Z",
            endTime: "2026-06-21T12:02:00.000Z",
            durationMs: 120000
          }
        ]
      }
    });

    await openMenuPage("Transcript");
    fireEvent.click((await screen.findAllByRole("button", { name: "View transcript" }))[0]);
    await screen.findByText("session transcript text");
    fireEvent.click(screen.getByRole("button", { name: "Copy transcript" }));

    expect(
      await screen.findByText("Copied the transcript using the browser fallback after direct clipboard access was blocked.")
    ).toBeTruthy();
  });

  it("shows a specific error when clipboard access is blocked and no fallback path exists", async () => {
    vi.spyOn(clipboardModule, "copyTextWithFallback").mockRejectedValue(
      new clipboardModule.CopyTextError("clipboard-blocked", true)
    );

    vi.mocked(loadSessionTranscript).mockResolvedValueOnce("session transcript text");

    renderApp({
      sessions: {
        items: [
          {
            id: "session-1",
            repoPath: "/workspace/project-one",
            startTime: "2026-06-21T12:00:00.000Z",
            endTime: "2026-06-21T12:02:00.000Z",
            durationMs: 120000
          }
        ]
      }
    });

    await openMenuPage("Transcript");
    fireEvent.click((await screen.findAllByRole("button", { name: "View transcript" }))[0]);
    await screen.findByText("session transcript text");
    fireEvent.click(screen.getByRole("button", { name: "Copy transcript" }));

    expect(
      await screen.findByText(
        "Direct clipboard access was blocked, and this browser does not offer a fallback copy path for the transcript."
      )
    ).toBeTruthy();
  });

  it("shows loading and empty diff states while inspecting repo changes", async () => {
    const deferred = createDeferredPromise<Awaited<ReturnType<typeof loadGitDiff>>>();
    vi.mocked(loadGitDiff).mockReturnValueOnce(deferred.promise);

    const socket = renderApp();
    emitSessionStatus(socket, true, "/workspace/default-project");

    await waitFor(() => {
      expect(document.querySelector(".console-layout.page-workspace.workspace-state-running")).toBeTruthy();
    });
    await openMenuPage("Changes");
    fireEvent.click(await screen.findByRole("button", { name: "Inspect changes" }));
    expect(await screen.findByText("Loading diff...")).toBeTruthy();

    deferred.resolve({
      repoPath: "/workspace/default-project",
      isGitRepo: true,
      stagedDiff: "",
      unstagedDiff: ""
    });

    expect(await screen.findByText("No current staged or unstaged changes.")).toBeTruthy();
  });

  it("shows a populated diff after loading repo changes", async () => {
    vi.mocked(loadGitDiff).mockResolvedValue({
      repoPath: "/workspace/default-project",
      isGitRepo: true,
      stagedDiff: "diff --git a/staged.txt b/staged.txt",
      unstagedDiff: "diff --git a/unstaged.txt b/unstaged.txt"
    });

    const socket = renderApp();
    emitSessionStatus(socket, true, "/workspace/default-project");

    await waitFor(() => {
      expect(document.querySelector(".console-layout.page-workspace.workspace-state-running")).toBeTruthy();
    });
    await openMenuPage("Changes");
    fireEvent.click(await screen.findByRole("button", { name: "Inspect changes" }));

    const diffPanel = await screen.findByText((content, element) => {
      return element?.tagName.toLowerCase() === "pre" && content.includes("=== Staged changes ===");
    });

    expect(diffPanel.textContent).toContain("=== Unstaged changes ===");
  });

  it("keeps the inspector closed by default during compose and active live-run states", async () => {
    const socket = renderApp();

    await openProjectPage();
    fireEvent.change(screen.getByLabelText("Project folder path"), {
      target: {
        value: "/workspace/default-project"
      }
    });
    fireEvent.click(getMenuButton("Workspace"));

    expect(await screen.findByText("Guide Codex intentionally")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Context" })).toBeTruthy();

    emitSessionStatus(socket, true, "/workspace/default-project");
    expect(await screen.findByText("Codex terminal")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Context" })).toBeTruthy();

    socket.emitMessage({
      type: "output",
      payload: "Would you like to run the following command?\nPress enter to confirm"
    });

    expect((await screen.findAllByText("Waiting for approval")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Context" })).toBeTruthy();
  });

  it("lets the user open and close inspector modes without leaving the workspace", async () => {
    const socket = renderApp();

    emitSessionStatus(socket, true, "/workspace/default-project");
    expect(await screen.findByText("Codex terminal")).toBeTruthy();

    await openMenuPage("Context");
    await openMenuPage("Transcript");
    await openMenuPage("Changes");
    await openMenuPage("Workspace");
    expect(screen.getByText("Codex terminal")).toBeTruthy();
  });

  it("opens review affordances after completion and closes the inspector when returning to project setup", async () => {
    const socket = renderApp({
      sessions: {
        items: [
          {
            id: "session-1",
            repoPath: "/workspace/default-project",
            startTime: "2026-06-22T21:10:00.000Z",
            endTime: "2026-06-22T21:12:00.000Z",
            durationMs: 120000
          }
        ]
      }
    });

    emitSessionStatus(socket, true, "/workspace/default-project");
    socket.emitMessage({
      type: "output",
      payload: "Created only README.md.\n\nDone."
    });
    socket.emitMessage({
      type: "exit",
      payload: {
        exitCode: 0,
        signal: 0,
        startedAt: "2026-06-22T21:10:00.000Z",
        endedAt: "2026-06-22T21:12:00.000Z",
        failure: null
      }
    });

    await openMenuPage("Workspace");
    expect((await screen.findAllByText(/completed/i)).length).toBeGreaterThan(0);
    await openMenuPage("Project");
    expect(await screen.findByText("Project setup")).toBeTruthy();
  });

  it("uses utility tabs for progressive disclosure and shows a results summary after completion", async () => {
    const socket = renderApp({
      sessions: {
        items: [
          {
            id: "session-1",
            repoPath: "/workspace/default-project",
            startTime: "2026-06-22T21:10:00.000Z",
            endTime: "2026-06-22T21:12:00.000Z",
            durationMs: 120000
          }
        ]
      }
    });

    emitSessionStatus(socket, true, "/workspace/default-project");

    await waitFor(() => {
      expect(document.querySelector(".console-layout.page-workspace.workspace-state-running")).toBeTruthy();
    });
    await openMenuPage("Changes");
    await openMenuPage("Context");

    socket.emitMessage({
      type: "output",
      payload: "Created only README.md.\n\nâ”€ Worked for 1m 23s â”€"
    });

    expect((await screen.findAllByText("Request completed")).length).toBeGreaterThanOrEqual(1);
    await waitFor(() => {
      expect(document.querySelector(".results-summary-card")).toBeTruthy();
    });
    expect(await screen.findByText("Guide Codex intentionally")).toBeTruthy();
  });
});
