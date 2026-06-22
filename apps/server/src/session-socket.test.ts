import { describe, expect, it, vi } from "vitest";
import { attachSessionSocket } from "./session-socket.js";

type MessageHandler = (rawMessage: { toString(): string }) => void;
type CloseHandler = () => void;

class FakeSocket {
  public readyState = 1;
  public sent: Array<{ type: string; payload: unknown }> = [];
  private messageHandler: MessageHandler | null = null;
  private closeHandler: CloseHandler | null = null;

  send(data: string): void {
    this.sent.push(JSON.parse(data) as { type: string; payload: unknown });
  }

  on(event: "message", listener: MessageHandler): void;
  on(event: "close", listener: CloseHandler): void;
  on(event: "message" | "close", listener: MessageHandler | CloseHandler): void {
    if (event === "message") {
      this.messageHandler = listener as MessageHandler;
      return;
    }

    this.closeHandler = listener as CloseHandler;
  }

  emitMessage(payload: unknown): void {
    this.messageHandler?.({
      toString: () => (typeof payload === "string" ? payload : JSON.stringify(payload))
    });
  }

  emitClose(): void {
    this.closeHandler?.();
  }
}

class FakePtyProcess {
  private dataHandler: ((data: string) => void) | null = null;
  private exitHandler: ((event: { exitCode: number; signal: number }) => void) | null = null;

  onData(handler: (data: string) => void): void {
    this.dataHandler = handler;
  }

  onExit(handler: (event: { exitCode: number; signal: number }) => void): void {
    this.exitHandler = handler;
  }

  emitData(data: string): void {
    this.dataHandler?.(data);
  }

  emitExit(exitCode: number, signal: number): void {
    this.exitHandler?.({ exitCode, signal });
  }
}

describe("attachSessionSocket", () => {
  it("sends initial status and starts a session from websocket messages", () => {
    const socket = new FakeSocket();
    const fakePty = new FakePtyProcess();
    const sessionManager = {
      getStatus: vi
        .fn()
        .mockReturnValueOnce({ active: false, repoPath: null })
        .mockReturnValueOnce({ active: true, repoPath: "/workspace/project" }),
      start: vi.fn().mockReturnValue({ ptyProcess: fakePty }),
      appendOutput: vi.fn(),
      clear: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      stop: vi.fn()
    };

    attachSessionSocket(socket, "owner-1", sessionManager as never);
    socket.emitMessage({ type: "start", repoPath: "/workspace/project" });

    expect(socket.sent[0]).toEqual({ type: "status", payload: { active: false, repoPath: null } });
    expect(sessionManager.start).toHaveBeenCalledWith("owner-1", "/workspace/project");
    expect(socket.sent[1]).toEqual({ type: "status", payload: { active: true, repoPath: "/workspace/project" } });
  });

  it("streams PTY output and sends exit plus inactive status", () => {
    const socket = new FakeSocket();
    const fakePty = new FakePtyProcess();
    const sessionManager = {
      getStatus: vi
        .fn()
        .mockReturnValueOnce({ active: false, repoPath: null })
        .mockReturnValueOnce({ active: true, repoPath: "/workspace/project" })
        .mockReturnValueOnce({ active: false, repoPath: null }),
      start: vi.fn().mockReturnValue({ ptyProcess: fakePty }),
      appendOutput: vi.fn(),
      clear: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      stop: vi.fn()
    };

    attachSessionSocket(socket, "owner-2", sessionManager as never);
    socket.emitMessage({ type: "start", repoPath: "/workspace/project" });
    fakePty.emitData("codex output");
    fakePty.emitExit(0, 15);

    expect(sessionManager.appendOutput).toHaveBeenCalledWith("owner-2", "codex output");
    expect(socket.sent).toContainEqual({ type: "output", payload: "codex output" });
    expect(sessionManager.clear).toHaveBeenCalledWith("owner-2");
    expect(socket.sent).toContainEqual({ type: "exit", payload: { exitCode: 0, signal: 15 } });
    expect(socket.sent).toContainEqual({ type: "status", payload: { active: false, repoPath: null } });
  });

  it("delegates input, resize, stop, and close cleanup", () => {
    const socket = new FakeSocket();
    const sessionManager = {
      getStatus: vi.fn().mockReturnValue({ active: false, repoPath: null }),
      start: vi.fn(),
      appendOutput: vi.fn(),
      clear: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      stop: vi.fn()
    };

    attachSessionSocket(socket, "owner-3", sessionManager as never);
    socket.emitMessage({ type: "input", data: "hello" });
    socket.emitMessage({ type: "resize", cols: 132, rows: 44 });
    socket.emitMessage({ type: "stop" });
    socket.emitClose();

    expect(sessionManager.write).toHaveBeenCalledWith("owner-3", "hello");
    expect(sessionManager.resize).toHaveBeenCalledWith("owner-3", 132, 44);
    expect(sessionManager.stop).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid and malformed websocket messages", () => {
    const socket = new FakeSocket();
    const sessionManager = {
      getStatus: vi.fn().mockReturnValue({ active: false, repoPath: null }),
      start: vi.fn(),
      appendOutput: vi.fn(),
      clear: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      stop: vi.fn()
    };

    attachSessionSocket(socket, "owner-4", sessionManager as never);
    socket.emitMessage("{bad json");
    socket.emitMessage({ nope: true });

    expect(socket.sent).toContainEqual({ type: "error", payload: "Invalid message." });
    expect(socket.sent).toContainEqual({ type: "error", payload: "Malformed message." });
  });
});
