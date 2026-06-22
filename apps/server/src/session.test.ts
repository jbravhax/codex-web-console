import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";

type ExitHandler = (event: { exitCode: number; signal: number }) => void;
type DataHandler = (data: string) => void;

class FakePtyProcess {
  public kill = vi.fn();
  public write = vi.fn();
  public resize = vi.fn();
  private dataHandler: DataHandler | null = null;
  private exitHandler: ExitHandler | null = null;

  onData(handler: DataHandler): void {
    this.dataHandler = handler;
  }

  onExit(handler: ExitHandler): void {
    this.exitHandler = handler;
  }

  emitData(data: string): void {
    this.dataHandler?.(data);
  }

  emitExit(exitCode: number, signal: number): void {
    this.exitHandler?.({ exitCode, signal });
  }
}

const spawnMock = vi.fn();

vi.mock("node-pty", () => ({
  default: {
    spawn: spawnMock
  }
}));

const { SessionManager } = await import("./session.js");

const SESSIONS_ROOT = path.join(os.homedir(), ".codex-web-console", "sessions");

function makeConfig(): AppConfig {
  return {
    codexExecutablePath: "codex",
    defaultRepoRoot: os.homedir(),
    serverBindHost: "127.0.0.1",
    serverPort: 8787,
    theme: "dark"
  };
}

function makeProjectDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.writeFileSync(path.join(dir, "README.md"), "# Example\n", "utf8");
  return dir;
}

let sessionDirsBefore: Set<string>;
let createdProjectPaths: string[] = [];
let managersToCleanup: Array<InstanceType<typeof SessionManager>> = [];

beforeEach(() => {
  spawnMock.mockReset();
  sessionDirsBefore = new Set(fs.readdirSync(SESSIONS_ROOT));
  createdProjectPaths = [];
  managersToCleanup = [];
});

afterEach(() => {
  for (const manager of managersToCleanup.splice(0, managersToCleanup.length)) {
    manager.stopAll();
  }

  for (const projectPath of createdProjectPaths.splice(0, createdProjectPaths.length)) {
    fs.rmSync(projectPath, { recursive: true, force: true });
  }

  const sessionDirsAfter = fs.readdirSync(SESSIONS_ROOT);
  for (const dirName of sessionDirsAfter) {
    if (!sessionDirsBefore.has(dirName)) {
      fs.rmSync(path.join(SESSIONS_ROOT, dirName), { recursive: true, force: true });
    }
  }
});

describe("SessionManager", () => {
  it("starts a session, writes output, and finalizes transcript metadata", () => {
    const repoPath = makeProjectDir("codex-web-session-");
    createdProjectPaths.push(repoPath);
    const fakePty = new FakePtyProcess();
    spawnMock.mockReturnValue(fakePty);
    const manager = new SessionManager(() => makeConfig());
    managersToCleanup.push(manager);

    const session = manager.start("owner-1", repoPath);
    expect(manager.getStatus("owner-1")).toEqual({ active: true, repoPath, startedAt: session.startedAt });

    manager.appendOutput("owner-1", "hello from codex");
    manager.clear("owner-1");

    expect(manager.getStatus("owner-1")).toEqual({ active: false, repoPath: null, startedAt: null });
    expect(fs.existsSync(session.transcriptPath)).toBe(true);
    expect(fs.existsSync(session.rawTranscriptPath)).toBe(true);
    expect(fs.readFileSync(session.transcriptPath, "utf8")).toBe("hello from codex");
    expect(fs.readFileSync(session.rawTranscriptPath, "utf8")).toBe("hello from codex");
    expect(JSON.parse(fs.readFileSync(session.metadataPath, "utf8"))).toMatchObject({
      id: session.sessionId,
      repoPath,
      endTime: expect.any(String),
      durationMs: expect.any(Number)
    });
    expect(manager.listSessions(1)[0]?.repoPath).toBe(repoPath);
  });

  it("stores cleaned transcript output instead of raw terminal escape sequences", () => {
    const repoPath = makeProjectDir("codex-web-session-");
    createdProjectPaths.push(repoPath);
    const fakePty = new FakePtyProcess();
    spawnMock.mockReturnValue(fakePty);
    const manager = new SessionManager(() => makeConfig());
    managersToCleanup.push(manager);

    const session = manager.start("owner-clean-transcript", repoPath);
    manager.appendOutput("owner-clean-transcript", "\u001b[31mError\u001b[39m\n");
    manager.appendOutput("owner-clean-transcript", "\u001b[2J\u001b[1;1HCreated README.md");
    manager.clear("owner-clean-transcript");

    expect(fs.readFileSync(session.transcriptPath, "utf8")).toBe("Error\nCreated README.md");
    expect(fs.readFileSync(session.rawTranscriptPath, "utf8")).toBe("\u001b[31mError\u001b[39m\n\u001b[2J\u001b[1;1HCreated README.md");
    expect(manager.getTranscript(session.sessionId)).toBe("Error\nCreated README.md");
    expect(manager.getRawTranscript(session.sessionId)).toBe("\u001b[31mError\u001b[39m\n\u001b[2J\u001b[1;1HCreated README.md");
  });

  it("stores the final shortened line when terminal redraw output uses carriage returns", () => {
    const repoPath = makeProjectDir("codex-web-session-");
    createdProjectPaths.push(repoPath);
    const fakePty = new FakePtyProcess();
    spawnMock.mockReturnValue(fakePty);
    const manager = new SessionManager(() => makeConfig());
    managersToCleanup.push(manager);

    const session = manager.start("owner-redraw-transcript", repoPath);
    manager.appendOutput("owner-redraw-transcript", "Processing 100%\rDone\n");
    manager.clear("owner-redraw-transcript");

    expect(fs.readFileSync(session.transcriptPath, "utf8")).toBe("Done\n");
    expect(manager.getTranscript(session.sessionId)).toBe("Done\n");
  });

  it("ignores transcript writes after a session is cleared", () => {
    const repoPath = makeProjectDir("codex-web-session-");
    createdProjectPaths.push(repoPath);
    const fakePty = new FakePtyProcess();
    spawnMock.mockReturnValue(fakePty);
    const manager = new SessionManager(() => makeConfig());
    managersToCleanup.push(manager);

    const session = manager.start("owner-late-output", repoPath);
    manager.appendOutput("owner-late-output", "before clear\n");
    manager.clear("owner-late-output");
    manager.appendOutput("owner-late-output", "after clear\n");

    expect(fs.readFileSync(session.transcriptPath, "utf8")).toBe("before clear\n");
  });

  it("delegates write, resize, and stop to the PTY process", () => {
    const repoPath = makeProjectDir("codex-web-session-");
    createdProjectPaths.push(repoPath);
    const fakePty = new FakePtyProcess();
    spawnMock.mockReturnValue(fakePty);
    const manager = new SessionManager(() => makeConfig());
    managersToCleanup.push(manager);

    manager.start("owner-2", repoPath);
    manager.write("owner-2", "prompt");
    manager.resize("owner-2", 140, 40);
    manager.stop("owner-2");

    expect(fakePty.write).toHaveBeenCalledWith("prompt");
    expect(fakePty.resize).toHaveBeenCalledWith(140, 40);
    expect(fakePty.kill).toHaveBeenCalledTimes(1);
  });

  it("rejects a second active session for the same owner", () => {
    const repoPath = makeProjectDir("codex-web-session-");
    createdProjectPaths.push(repoPath);
    spawnMock.mockReturnValue(new FakePtyProcess());
    const manager = new SessionManager(() => makeConfig());
    managersToCleanup.push(manager);

    manager.start("owner-3", repoPath);

    expect(() => manager.start("owner-3", repoPath)).toThrow("already has an active Codex process");
  });

  it("kills all active PTY processes during stopAll", () => {
    const repoPathOne = makeProjectDir("codex-web-session-");
    const repoPathTwo = makeProjectDir("codex-web-session-");
    createdProjectPaths.push(repoPathOne, repoPathTwo);
    const firstPty = new FakePtyProcess();
    const secondPty = new FakePtyProcess();
    spawnMock.mockReturnValueOnce(firstPty).mockReturnValueOnce(secondPty);
    const manager = new SessionManager(() => makeConfig());
    managersToCleanup.push(manager);

    manager.start("owner-a", repoPathOne);
    manager.start("owner-b", repoPathTwo);
    manager.stopAll();

    expect(firstPty.kill).toHaveBeenCalledTimes(1);
    expect(secondPty.kill).toHaveBeenCalledTimes(1);
    expect(manager.getStatus("owner-a")).toEqual({ active: false, repoPath: null, startedAt: null });
    expect(manager.getStatus("owner-b")).toEqual({ active: false, repoPath: null, startedAt: null });
  });

  it("finalizes transcripts during stopAll and ignores late output", () => {
    const repoPath = makeProjectDir("codex-web-session-");
    createdProjectPaths.push(repoPath);
    const fakePty = new FakePtyProcess();
    spawnMock.mockReturnValue(fakePty);
    const manager = new SessionManager(() => makeConfig());
    managersToCleanup.push(manager);

    const session = manager.start("owner-stop-all", repoPath);
    manager.appendOutput("owner-stop-all", "before stopAll\n");
    manager.stopAll();
    manager.appendOutput("owner-stop-all", "after stopAll\n");

    expect(fs.readFileSync(session.transcriptPath, "utf8")).toBe("before stopAll\n");
    expect(JSON.parse(fs.readFileSync(session.metadataPath, "utf8"))).toMatchObject({
      id: session.sessionId,
      repoPath,
      endTime: expect.any(String),
      durationMs: expect.any(Number)
    });
  });
});
