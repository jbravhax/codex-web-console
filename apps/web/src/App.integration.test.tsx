import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { loadGitDiff } from "./git-diff-viewer";
import { REPO_PICKER_UNSUPPORTED_MESSAGE, chooseRepoDirectory } from "./repo-picker";
import { loadSessionTranscript } from "./session-transcripts";
import { buildSubmittedPromptInput } from "./terminal-session";

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
  onclose: (() => void) | null = null;

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.onclose?.();
  }

  emitOpen() {
    this.onopen?.();
  }

  emitMessage(payload: unknown) {
    this.onmessage?.({
      data: JSON.stringify(payload)
    });
  }

  emitClose() {
    this.onclose?.();
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
  documents?: { ok: boolean; payload: unknown };
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
      repoPath
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

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.mocked(chooseRepoDirectory).mockReset();
  vi.mocked(loadGitDiff).mockReset();
  vi.mocked(loadSessionTranscript).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App integration", () => {
  it("shows repo picker guidance when the browser does not support choosing folders", async () => {
    vi.mocked(chooseRepoDirectory).mockResolvedValue({
      kind: "unsupported",
      message: REPO_PICKER_UNSUPPORTED_MESSAGE
    });

    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Choose repo" }));

    expect(await screen.findByText(REPO_PICKER_UNSUPPORTED_MESSAGE)).toBeTruthy();
  });

  it("walks the session banner through idle, starting, running, stopping, and stopped states", async () => {
    const socket = renderApp();

    expect(await screen.findByText("Idle")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Repo path"), {
      target: {
        value: "/workspace/default-project"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Start session" }));
    expect(screen.getByText("Starting session")).toBeTruthy();

    emitSessionStatus(socket, true, "/workspace/default-project");
    expect(await screen.findByText("Session running")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Stop session" }));
    expect(screen.getByText("Stopping session")).toBeTruthy();

    socket.emitMessage({
      type: "exit",
      payload: {
        exitCode: 0,
        signal: 15
      }
    });

    expect(await screen.findByText("Session stopped")).toBeTruthy();
  });

  it("shows the generated prompt preview when expanded", async () => {
    const socket = renderApp();
    emitSessionStatus(socket, true, "/workspace/default-project");

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

    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: {
        value: "Reply with exactly: OK"
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "Send prompt" }));

    expect(await screen.findByText("Waiting for Codex")).toBeTruthy();
    expect(socket.sent).toContain(
      JSON.stringify({
        type: "input",
        data: buildSubmittedPromptInput("Reply with exactly: OK")
      })
    );

    socket.emitMessage({
      type: "output",
      payload: "Would you like to run the following command?\nPress enter to confirm"
    });
    expect(await screen.findByText("Approval needed")).toBeTruthy();
    expect(screen.getAllByText(/Press Enter to approve or Esc to cancel/i).length).toBeGreaterThan(0);

    socket.emitMessage({
      type: "output",
      payload: "Created only README.md."
    });
    expect(await screen.findByText("Codex is responding")).toBeTruthy();
  });

  it("shows specific repo validation errors instead of generic attachment guidance", async () => {
    const socket = renderApp();

    socket.emitMessage({
      type: "error",
      payload: "The path does not exist: /workspace/missing-project"
    });

    const repoPathMessages = await screen.findAllByText(/That project folder does not exist yet/i);
    expect(repoPathMessages.length).toBeGreaterThanOrEqual(1);
  });

  it("shows an empty preview state when nothing is queued", async () => {
    const socket = renderApp();
    emitSessionStatus(socket, true, "/workspace/default-project");
    expect(await screen.findByText("Session running")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));

    expect(await screen.findByText("Nothing queued yet")).toBeTruthy();
    expect(screen.getByText("Nothing will be sent yet. Add a prompt or context to build the final message.")).toBeTruthy();
  });

  it("saves large pasted text as document context and explains the file reference", async () => {
    const socket = renderApp();
    emitSessionStatus(socket, true, "/workspace/default-project");
    expect(await screen.findByText("Session running")).toBeTruthy();

    fireEvent.paste(screen.getByLabelText("Prompt"), {
      clipboardData: {
        items: [],
        getData: () => "x".repeat(10000)
      }
    });

    expect(await screen.findByText(/Saved large pasted text to \.codex-web\/documents\/pasted-20260621-120000\.md\./)).toBeTruthy();
    expect(screen.getByText("Large pasted documents")).toBeTruthy();
    expect(screen.getByText(".codex-web/documents/pasted-20260621-120000.md")).toBeTruthy();
  });

  it("shows a friendly large-paste failure message", async () => {
    const socket = renderApp();
    emitSessionStatus(socket, true, "/workspace/default-project");
    expect(await screen.findByText("Session running")).toBeTruthy();

    fireEvent.paste(screen.getByLabelText("Prompt"), {
      clipboardData: {
        items: [],
        getData: () => "x".repeat(1024 * 1024 + 1)
      }
    });

    expect(await screen.findByText("Could not save that pasted text. It is over the current 1MB limit, so split it into smaller pieces first.")).toBeTruthy();
  });

  it("clears all pending context after adding a saved document", async () => {
    const socket = renderApp();
    emitSessionStatus(socket, true, "/workspace/default-project");
    expect(await screen.findByText("Session running")).toBeTruthy();

    fireEvent.paste(screen.getByLabelText("Prompt"), {
      clipboardData: {
        items: [],
        getData: () => "x".repeat(10000)
      }
    });

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

    const transcriptButtons = await screen.findAllByRole("button", { name: "View transcript" });

    fireEvent.click(transcriptButtons[0]);
    expect(await screen.findByText("Loading transcript...")).toBeTruthy();
    expect(await screen.findByText("session transcript text")).toBeTruthy();

    fireEvent.click(transcriptButtons[1]);
    expect(await screen.findByText("Session transcript not found.")).toBeTruthy();
  });

  it("shows loading and empty diff states while inspecting repo changes", async () => {
    const deferred = createDeferredPromise<Awaited<ReturnType<typeof loadGitDiff>>>();
    vi.mocked(loadGitDiff).mockReturnValueOnce(deferred.promise);

    const socket = renderApp();
    emitSessionStatus(socket, true, "/workspace/default-project");

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

    fireEvent.click(await screen.findByRole("button", { name: "Inspect changes" }));

    const diffPanel = await screen.findByText((content, element) => {
      return element?.tagName.toLowerCase() === "pre" && content.includes("=== Staged changes ===");
    });

    expect(diffPanel.textContent).toContain("=== Unstaged changes ===");
  });
});
