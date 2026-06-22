import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pty, { type IPty } from "node-pty";
import type { AppConfig } from "./config.js";
import { validateRepoPath } from "./repo-paths.js";
import { stripTerminalSequences } from "./transcript-cleaner.js";

export type SessionStatus = {
  active: boolean;
  repoPath: string | null;
};

export type SessionListItem = {
  id: string;
  repoPath: string;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
};

type SessionMetadata = {
  id: string;
  repoPath: string;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
};

type ActiveSession = {
  ownerId: string;
  sessionId: string;
  ptyProcess: IPty;
  repoPath: string;
  startedAt: string;
  transcriptPath: string;
  metadataPath: string;
  recentOutput: string;
  isFinalized: boolean;
};

const SESSIONS_ROOT = path.join(os.homedir(), ".codex-web-console", "sessions");

function ensureSessionsRoot(): void {
  fs.mkdirSync(SESSIONS_ROOT, { recursive: true });
}

ensureSessionsRoot();

function createSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function writeMetadata(metadataPath: string, metadata: SessionMetadata): void {
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

function readMetadata(metadataPath: string): SessionMetadata | null {
  try {
    return JSON.parse(fs.readFileSync(metadataPath, "utf8")) as SessionMetadata;
  } catch {
    return null;
  }
}

function finalizeSession(session: ActiveSession): void {
  if (session.isFinalized) {
    return;
  }

  session.isFinalized = true;
  const endTime = new Date().toISOString();
  const durationMs = Math.max(0, new Date(endTime).getTime() - new Date(session.startedAt).getTime());

  writeMetadata(session.metadataPath, {
    id: session.sessionId,
    repoPath: session.repoPath,
    startTime: session.startedAt,
    endTime,
    durationMs
  });
}

export class SessionManager {
  private sessions = new Map<string, ActiveSession>();

  constructor(
    private readonly getConfig: () => AppConfig,
    private readonly onSessionStarted?: (repoPath: string) => void
  ) {}

  getStatus(ownerId: string): SessionStatus {
    const session = this.sessions.get(ownerId);
    return {
      active: session !== undefined,
      repoPath: session?.repoPath ?? null
    };
  }

  start(ownerId: string, repoPath: string): ActiveSession {
    if (this.sessions.has(ownerId)) {
      throw new Error("This browser session already has an active Codex process.");
    }

    const validatedPath = validateRepoPath(repoPath);
    const sessionId = createSessionId();
    const sessionDir = path.join(SESSIONS_ROOT, sessionId);
    const transcriptPath = path.join(sessionDir, "transcript.txt");
    const metadataPath = path.join(sessionDir, "metadata.json");
    const startedAt = new Date().toISOString();

    ensureSessionsRoot();
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(transcriptPath, "", "utf8");
    const config = this.getConfig();
    const ptyProcess = pty.spawn(config.codexExecutablePath, [], {
      name: "xterm-256color",
      cols: 120,
      rows: 32,
      cwd: validatedPath,
      env: {
        ...process.env,
        TERM: "xterm-256color"
      }
    });

    const session = {
      ownerId,
      sessionId,
      ptyProcess,
      repoPath: validatedPath,
      startedAt,
      transcriptPath,
      metadataPath,
      recentOutput: "",
      isFinalized: false
    };

    writeMetadata(metadataPath, {
      id: sessionId,
      repoPath: validatedPath,
      startTime: startedAt,
      endTime: null,
      durationMs: null
    });

    this.sessions.set(ownerId, session);
    this.onSessionStarted?.(validatedPath);
    return session;
  }

  stop(ownerId: string): void {
    const session = this.sessions.get(ownerId);
    if (!session) {
      return;
    }

    session.ptyProcess.kill();
  }

  write(ownerId: string, data: string): void {
    const session = this.sessions.get(ownerId);
    if (!session) {
      return;
    }

    session.ptyProcess.write(data);
  }

  resize(ownerId: string, cols: number, rows: number): void {
    const session = this.sessions.get(ownerId);
    if (!session) {
      return;
    }

    session.ptyProcess.resize(cols, rows);
  }

  appendOutput(ownerId: string, data: string): void {
    const session = this.sessions.get(ownerId);
    if (!session || session.isFinalized) {
      return;
    }

    const cleanedOutput = stripTerminalSequences(data);
    if (!cleanedOutput) {
      return;
    }

    session.recentOutput = `${session.recentOutput}${cleanedOutput}`.slice(-800);
    fs.appendFileSync(session.transcriptPath, cleanedOutput, "utf8");
  }

  getRecentOutput(ownerId: string): string {
    return this.sessions.get(ownerId)?.recentOutput ?? "";
  }

  clear(ownerId: string): void {
    const session = this.sessions.get(ownerId);
    if (!session) {
      return;
    }

    finalizeSession(session);
    this.sessions.delete(ownerId);
  }

  stopAll(): void {
    for (const [ownerId, session] of this.sessions.entries()) {
      session.ptyProcess.kill();
      finalizeSession(session);
      this.sessions.delete(ownerId);
    }
  }

  listSessions(limit = 10): SessionListItem[] {
    ensureSessionsRoot();
    const sessionDirs = fs
      .readdirSync(SESSIONS_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(SESSIONS_ROOT, entry.name));

    return sessionDirs
      .map((sessionDir) => readMetadata(path.join(sessionDir, "metadata.json")))
      .filter((metadata): metadata is SessionMetadata => metadata !== null)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, limit)
      .map((metadata) => ({
        id: metadata.id,
        repoPath: metadata.repoPath,
        startTime: metadata.startTime,
        endTime: metadata.endTime,
        durationMs: metadata.durationMs
      }));
  }

  getTranscript(sessionId: string): string | null {
    ensureSessionsRoot();
    const transcriptPath = path.join(SESSIONS_ROOT, sessionId, "transcript.txt");
    try {
      return stripTerminalSequences(fs.readFileSync(transcriptPath, "utf8"));
    } catch {
      return null;
    }
  }
}
