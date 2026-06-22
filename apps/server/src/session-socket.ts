import type { SessionManager } from "./session.js";

type SocketReadyState = 1;

type SessionSocket = {
  readyState: number;
  send(data: string): void;
  on(event: "message", listener: (rawMessage: { toString(): string }) => void): void;
  on(event: "close", listener: () => void): void;
};

function sendMessage(socket: SessionSocket, type: string, payload: unknown): void {
  socket.send(JSON.stringify({ type, payload }));
}

export function attachSessionSocket(socket: SessionSocket, ownerId: string, sessionManager: SessionManager): void {
  sendMessage(socket, "status", sessionManager.getStatus(ownerId));

  socket.on("message", (rawMessage) => {
    let message: unknown;

    try {
      message = JSON.parse(rawMessage.toString());
    } catch {
      sendMessage(socket, "error", "Invalid message.");
      return;
    }

    if (!message || typeof message !== "object" || !("type" in message)) {
      sendMessage(socket, "error", "Malformed message.");
      return;
    }

    const typedMessage = message as
      | { type: "start"; repoPath?: string }
      | { type: "input"; data?: string }
      | { type: "stop" }
      | { type: "resize"; cols?: number; rows?: number };

    if (typedMessage.type === "start") {
      try {
        const session = sessionManager.start(ownerId, typedMessage.repoPath ?? "");

        session.ptyProcess.onData((data) => {
          sessionManager.appendOutput(ownerId, data);
          if (socket.readyState === (1 as SocketReadyState)) {
            sendMessage(socket, "output", data);
          }
        });

        session.ptyProcess.onExit(({ exitCode, signal }) => {
          sessionManager.clear(ownerId);
          if (socket.readyState === (1 as SocketReadyState)) {
            sendMessage(socket, "exit", { exitCode, signal });
            sendMessage(socket, "status", sessionManager.getStatus(ownerId));
          }
        });

        sendMessage(socket, "status", sessionManager.getStatus(ownerId));
      } catch (error) {
        sendMessage(socket, "error", error instanceof Error ? error.message : "Failed to start session.");
      }

      return;
    }

    if (typedMessage.type === "input") {
      sessionManager.write(ownerId, typedMessage.data ?? "");
      return;
    }

    if (typedMessage.type === "stop") {
      sessionManager.stop(ownerId);
      return;
    }

    if (typedMessage.type === "resize") {
      sessionManager.resize(ownerId, typedMessage.cols ?? 120, typedMessage.rows ?? 32);
    }
  });

  socket.on("close", () => {
    sessionManager.stop(ownerId);
  });
}
