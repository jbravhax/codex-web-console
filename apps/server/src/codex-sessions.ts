import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CODEX_SESSION_INDEX_PATH = path.join(os.homedir(), ".codex", "session_index.jsonl");
const CODEX_SESSIONS_ROOT = path.join(os.homedir(), ".codex", "sessions");
const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLLOUT_FILE_PATTERN = /rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;

export type CodexSessionIndexEntry = {
  id: string;
  threadName?: string;
  updatedAt?: string;
};

export function isCodexSessionId(value: string): boolean {
  return SESSION_ID_PATTERN.test(value.trim());
}

function listSessionsFromIndex(): CodexSessionIndexEntry[] {
  if (!fs.existsSync(CODEX_SESSION_INDEX_PATH)) {
    return [];
  }

  const rawIndex = fs.readFileSync(CODEX_SESSION_INDEX_PATH, "utf8");
  return rawIndex
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as {
          id?: unknown;
          thread_name?: unknown;
          updated_at?: unknown;
        };

        if (typeof parsed.id !== "string" || !isCodexSessionId(parsed.id)) {
          return [];
        }

        return [
          {
            id: parsed.id,
            threadName: typeof parsed.thread_name === "string" ? parsed.thread_name : undefined,
            updatedAt: typeof parsed.updated_at === "string" ? parsed.updated_at : undefined
          }
        ];
      } catch {
        return [];
      }
    });
}

function listSessionsFromRollouts(root = CODEX_SESSIONS_ROOT): CodexSessionIndexEntry[] {
  if (!fs.existsSync(root)) {
    return [];
  }

  const sessions: CodexSessionIndexEntry[] = [];
  const pendingDirs = [root];

  while (pendingDirs.length > 0) {
    const currentDir = pendingDirs.pop();
    if (!currentDir) {
      continue;
    }

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pendingDirs.push(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const fileMatch = entry.name.match(ROLLOUT_FILE_PATTERN);
      if (!fileMatch || !isCodexSessionId(fileMatch[1])) {
        continue;
      }

      const stats = fs.statSync(entryPath);
      sessions.push({
        id: fileMatch[1],
        updatedAt: stats.mtime.toISOString()
      });
    }
  }

  return sessions;
}

export function listCodexSessions(): CodexSessionIndexEntry[] {
  const merged = new Map<string, CodexSessionIndexEntry>();

  for (const entry of [...listSessionsFromRollouts(), ...listSessionsFromIndex()]) {
    const existing = merged.get(entry.id);
    if (!existing) {
      merged.set(entry.id, entry);
      continue;
    }

    merged.set(entry.id, {
      id: entry.id,
      threadName: entry.threadName ?? existing.threadName,
      updatedAt: entry.updatedAt ?? existing.updatedAt
    });
  }

  return [...merged.values()].sort((left, right) => {
    const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
    const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
    return rightTime - leftTime;
  });
}

export function findCodexSession(sessionId: string): CodexSessionIndexEntry | null {
  const normalizedSessionId = sessionId.trim();
  if (!isCodexSessionId(normalizedSessionId)) {
    return null;
  }

  return listCodexSessions().find((entry) => entry.id === normalizedSessionId) ?? null;
}

export function findMostRecentCodexSession(startedAt?: string | null): CodexSessionIndexEntry | null {
  const sessions = listCodexSessions();
  if (sessions.length === 0) {
    return null;
  }

  if (!startedAt) {
    return sessions[0] ?? null;
  }

  const startedAtMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startedAtMs)) {
    return sessions[0] ?? null;
  }

  const matchingSession =
    sessions.find((entry) => {
      if (!entry.updatedAt) {
        return false;
      }

      const updatedAtMs = new Date(entry.updatedAt).getTime();
      return Number.isFinite(updatedAtMs) && updatedAtMs >= startedAtMs - 60_000;
    }) ?? null;

  return matchingSession ?? sessions[0] ?? null;
}
